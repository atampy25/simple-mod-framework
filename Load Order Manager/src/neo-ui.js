customElements.define('neo-input', class AppDrawer extends HTMLElement {
	static get observedAttributes() {
		return ['label', 'placeholder']
	}

	get value() {
		return this.shadowDOM.querySelector("input").value
	}

	set value(val) {
		this.shadowDOM.querySelector("input").value = val
	}

	get disabled() {
		return this.shadowDOM.querySelector("input").disabled
	}

	set disabled(val) {
		this.shadowDOM.querySelector("input").disabled = val
	}

	get inputElement() {
		return this.shadowDOM.querySelector("input")
	}

	constructor() {
		super();

		this.shadowDOM = this.attachShadow({mode: 'open'})
		this.shadowDOM.innerHTML = `
			<link rel="stylesheet" href="tailwind.min.css">
			<style>
				:host {
					display: block;
				}
			</style>
			<div class="mb-4">
				<label class="block mb-2">
					Input
				</label>
				<div>
					<input class="shadow appearance-none border rounded w-full py-2 px-2.5 text-black" type="text" placeholder="Enter an input">
				</div>
			</div>
		`
	}

	attributeChangedCallback(name, oldValue, newValue) {
		this.shadowDOM.querySelector("label").innerText = this.getAttribute("label")
		this.shadowDOM.querySelector("input").placeholder = this.getAttribute("placeholder")
	}
});

customElements.define('neo-checkbox', class AppDrawer extends HTMLElement {
	static get observedAttributes() {
		return ['label']
	}

	get checked() {
		return this.shadowDOM.querySelector("input").checked
	}

	set checked(val) {
		this.shadowDOM.querySelector("input").checked = val
	}

	get disabled() {
		return this.shadowDOM.querySelector("input").disabled
	}

	set disabled(val) {
		this.shadowDOM.querySelector("input").disabled = val
	}

	get inputElement() {
		return this.shadowDOM.querySelector("input")
	}

	constructor() {
		super();

		this.shadowDOM = this.attachShadow({mode: 'open'})
		this.shadowDOM.innerHTML = `
			<link rel="stylesheet" href="tailwind.min.css">
			<style>
				:host {
					display: block;
				}
			</style>
			<label class="inline-flex items-center mb-3">
				<input type="checkbox" class="form-checkbox cursor-pointer h-5 w-5 text-gray-700 bg-white"><span class="ml-2"></span>
			</label>
		`
	}

	attributeChangedCallback(name, oldValue, newValue) {
		this.shadowDOM.querySelector("span").innerText = this.getAttribute("label")
	}
});

customElements.define('neo-select', class AppDrawer extends HTMLElement {
	static get observedAttributes() {
		return ['label']
	}

	get value() {
		return this.shadowDOM.querySelector("select").value
	}

	set value(val) {
		this.shadowDOM.querySelector("select").value = val
	}

	get disabled() {
		return this.shadowDOM.querySelector("select").disabled
	}

	set disabled(val) {
		this.shadowDOM.querySelector("select").disabled = val
	}

	get selectElement() {
		return this.shadowDOM.querySelector("select")
	}

	constructor() {
		super();

		this.shadowDOM = this.attachShadow({mode: 'open'})
		this.shadowDOM.innerHTML = `
			<link rel="stylesheet" href="tailwind.min.css">
			<style>
				:host {
					display: block;
				}
			</style>
			<div class="relative">
				<label class="block mb-2">
					Select an option
				</label>
				<select class="w-full shadow border text-black py-2 px-3 pr-8 rounded appearance-none" style="background-image: linear-gradient(45deg, transparent 50%, gray 50%), linear-gradient(135deg, gray 50%, transparent 50%), linear-gradient(to right, #ccc, #ccc); background-position: calc(100% - 20px) calc(1em + 2px), calc(100% - 15px) calc(1em + 2px), calc(100% - 2.5em) 0.5em; background-size: 5px 5px, 5px 5px, 1px 1.5em; background-repeat: no-repeat;"></select>
				<slot></slot>
			</div>
		`

		this.shadowDOM.addEventListener('slotchange', event => {
            if (this.querySelector('option')) {
				this.shadowDOM.querySelector("select").append(this.querySelector('option'))
			}
        })
	}

	attributeChangedCallback(name, oldValue, newValue) {
		this.shadowDOM.querySelector("label").innerText = this.getAttribute("label")
	}
});

customElements.define('neo-file-upload', class AppDrawer extends HTMLElement {
	static get observedAttributes() {
		return ['label']
	}

	get value() {
		return this.shadowDOM.querySelector("input").value
	}

	set value(val) {
		this.shadowDOM.querySelector("input").value = val
	}

	get disabled() {
		return this.shadowDOM.querySelector("input").disabled
	}

	set disabled(val) {
		this.shadowDOM.querySelector("input").disabled = val
	}

	get inputElement() {
		return this.shadowDOM.querySelector("input")
	}

	get uploadedFilePath() {
		return this.shadowDOM.getElementById("fileUpload").files[0]
	}

	updateFileName() {
		var fileInput = this.shadowDOM.getElementById("fileUpload")
		if (fileInput.files.length > 0 && (!this.acceptedFileTypes || this.acceptedFileTypes.includes(fileInput.files[0].type))) {
			this.shadowDOM.getElementById("fileName").textContent = fileInput.files[0].name
		} else {
			fileInput.value = ""
			this.shadowDOM.getElementById("fileName").textContent = "Must be " + this.acceptedFileTypes.join(" or ")
		}
	}

	constructor() {
		super();

		this.acceptedFileTypes = this.getAttribute("acceptedFileTypes") ? this.getAttribute("acceptedFileTypes").split(", ") : false

		this.shadowDOM = this.attachShadow({mode: 'open'})
		this.shadowDOM.innerHTML = `
			<link rel="stylesheet" href="tailwind.min.css">
			<style>
				:host {
					display: block;
					margin-top: 2.5rem;
					margin-bottom: 2.5rem;
				}
			</style>
			<label class="w-64 px-4 py-6 text-blue rounded-lg shadow-lg tracking-wide border border-blue cursor-pointer hover:bg-blue hover:text-white">
				<span class="mt-2"><slot name="icon"></slot> <span id="label" class="font-semibold"></span></span>
				<span class="mt-2 font-light" id="fileName">No file uploaded</span>
				<input type='file' class="hidden" id="fileUpload" onchange="this.getRootNode().host.updateFileName()"/>
			</label>
		`
	}

	attributeChangedCallback(name, oldValue, newValue) {
		this.shadowDOM.querySelector("label").innerText = this.getAttribute("label")
	}
});

customElements.define('neo-button', class AppDrawer extends HTMLElement {
	static get observedAttributes() {
		return ['label', 'gradientFrom', 'gradientTo']
	}

	get value() {
		return this.shadowDOM.querySelector("button").value
	}

	set value(val) {
		this.shadowDOM.querySelector("button").value = val
	}

	get disabled() {
		return this.shadowDOM.querySelector("button").disabled
	}

	set disabled(val) {
		this.shadowDOM.querySelector("button").disabled = val
	}

	get buttonElement() {
		return this.shadowDOM.querySelector("button")
	}

	constructor() {
		super();

		this.shadowDOM = this.attachShadow({mode: 'open'})

		if (this.small) {
			this.shadowDOM.innerHTML = `
				<link rel="stylesheet" href="tailwind.min.css">
				<style>
					:host {
						display: block;
					}
				</style>
				<button type="button" class="bg-gradient-to-r text-white font-light px-2 py-1.5 rounded-md m-1" style="font-family: 'Fira Code'">
					<slot name="icon"></slot> <span></span>
				</button>
			`
		} else {
			this.shadowDOM.innerHTML = `
				<link rel="stylesheet" href="tailwind.min.css">
				<style>
					:host {
						display: block;
					}
				</style>
				<button type="button" class="bg-gradient-to-r text-white font-light px-3.5 py-3 rounded-md m-2" style="font-family: 'Fira Code'">
					<slot name="icon"></slot> <span></span>
				</button>
			`
		}
	}

	attributeChangedCallback(name, oldValue, newValue) {
		this.shadowDOM.querySelector("span").innerText = this.getAttribute("label")
		this.shadowDOM.querySelector("button").classList.add(this.getAttribute("gradientFrom"))
		this.shadowDOM.querySelector("button").classList.add(this.getAttribute("gradientTo"))
	}
});