#[macro_use]
extern crate napi_derive;

use std::{
	cmp::Ordering,
	env,
	ffi::OsStr,
	fs,
	path::{Path, PathBuf},
};

use human_sort::compare;
use regex::Regex;
use sysinfo::{DiskExt, RefreshKind, System, SystemExt};
use walkdir::WalkDir;

#[napi]
pub fn stage_dependencies_from(from_folder: String, to_folder: String) {
	let re_rpkg = Regex::new(r"(?i)00[0-9A-F]*\..*?\\(chunk[0-9]*(?:patch[0-9]*)?)\\").unwrap();
	let re_rpkg_chunk =
		Regex::new(r"(?i)00[0-9A-F]*\..*?\\(chunk[0-9]*)(?:patch[0-9]*)?\\").unwrap();
	let re_meta = Regex::new(r"(?i)chunk[0-9]*(?:patch[0-9]*)?\.meta").unwrap();

	// Walk folder, get files, extract RPKG names for paths
	let mut all_files = WalkDir::new(from_folder)
		.into_iter()
		.filter_map(|x| x.ok())
		.filter(|x| x.file_type().is_file())
		.map(|x| {
			(
				re_rpkg
					.captures_iter(x.path().to_str().unwrap())
					.next()
					.unwrap()[1]
					.to_owned(),
				re_rpkg_chunk
					.captures_iter(x.path().to_str().unwrap())
					.next()
					.unwrap()[1]
					.to_owned(),
				x.path().to_owned(),
			)
		})
		.collect::<Vec<_>>();

	// Sort by RPKG in descending order
	all_files.sort_by(|(rpkg_a, chunk_a, _), (rpkg_b, chunk_b, _)| {
		match compare(chunk_a, chunk_b) {
			// If chunks are the same, compare patches in descending order
			Ordering::Equal => compare(rpkg_a, rpkg_b).reverse(),

			// If chunks are different, compare chunks in ascending order
			_ => compare(chunk_a, chunk_b),
		}
	});

	// Include only first versions of files (sorted already so the right versions will be used)
	let mut all_files_superseded: Vec<PathBuf> = vec![];
	for (_, _, path) in all_files {
		if !all_files_superseded
			.iter()
			.any(|x| x.file_name().unwrap() == path.file_name().unwrap())
		{
			all_files_superseded.push(path);
		}
	}

	// Remove all chunk metas
	all_files_superseded.retain(|x| !re_meta.is_match(x.file_name().unwrap().to_str().unwrap()));

	// Ensure staging folder exists
	if !Path::new("staging").join(&to_folder).is_dir() {
		fs::create_dir(Path::new("staging").join(&to_folder)).unwrap();
	}

	// Copy all to staging
	for file_path in all_files_superseded {
		let p = Path::new("staging")
			.join(&to_folder)
			.join(file_path.file_name().unwrap());

		if !p.exists() {
			if p.extension().and_then(OsStr::to_str) == Some("meta")
				&& p.with_extension("meta.json").exists()
			{
				continue;
			}

			fs::copy(&file_path, p).unwrap();
		}
	}
}

#[napi]
pub fn free_disk_space() -> Result<f64, napi::Error> {
	let cur_path = env::current_dir()?;
	let sys = System::new_with_specifics(RefreshKind::new().with_disks_list());

	let cur_disk = sys
		.disks()
		.iter()
		.find_map(|x| {
			if cur_path
				.to_string_lossy()
				.to_lowercase()
				.starts_with(&x.mount_point().to_str()?.to_lowercase())
			{
				Some(x)
			} else {
				None
			}
		})
		.expect("Couldn't get current disk!");

	Ok(cur_disk.available_space() as f64)
}
