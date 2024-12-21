export function createUI() {
	const ui = `
      	<style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=Rajdhani:wght@700&display=swap');

            .backdrop-blur {
                display: "block";
                width: 100vw;
                height: 100vh;
                position: fixed;
                z-index: 10;
                top: 0;
                left: 0;

                background-color: rgba(0, 0, 0, 0.5);
            }

            .settings-ui {
                width: 60vw;
                height: 40vw;
                position: fixed;
                z-index: 20;

                background-color: #020817;
                border-radius: 1rem;
                border: 1px solid #1E293B;
                color: #F8FAFC;
                font-family: "Inter";

                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);

                display: flex;
                flex-direction: column;
            }

            .settings-ui * {
                margin: 0;
                padding: 0;
            }

            .header {
                padding: 1rem;
                display: flex;

                align-items: center;
                justify-content: space-between;
            }

            .header .side {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .header #close {
                cursor: pointer;
            }

            .header h1 {
                font-family: "Rajdhani";
            }

            .header img {
                height: 3rem;
                width: 3rem;
            }

            .settings-ui .tabs {
                padding: 0rem 1rem;
                display: flex;
                align-items: start;
                gap: 2rem;

                border-bottom: 1px solid #313244;
            }

            .settings-ui span {
                cursor: pointer;
            }

            .settings-ui span.selected {
                border-bottom: 2.5px solid #cdd6f4;
                padding-bottom: 6px;
            }

            .content {
                display: flex;
                flex-direction: column;
                flex: 1;

                overflow-y: scroll;

                padding: 1rem;

                gap: 1.25rem;
            }

            .settings-ui .setting {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .settings-ui .setting p {

            }

            .hidden {
                display: none;
            }
            
            .hidden2 {
            display: none;
            }

            .settings-ui .input {
                background-color: #020817;
                color: #cdd6f4;
                border: 1px solid #1E293B;
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 14px;
                transition: all 0.2s ease;
            }

            .settings-ui .input:focus {
                outline: none;
            }

            .settings-ui .input::placeholder {
                color: #6c7086;
            }

            .settings-ui .checkbox-wrapper {
                position: relative;
                display: inline-block;
            }

            .settings-ui .checkbox-wrapper input {
                position: absolute;
                opacity: 0;
                cursor: pointer;
                height: 0;
                width: 0;
            }

            .settings-ui .checkbox-mark {
                position: absolute;
                height: 18px;
                width: 18px;
                background-color: #1E293B;
                border: 1px solid #1E293B; 
                border-radius: 4px;
                transition: all 0.2s ease;
            }

            .settings-ui .checkbox-wrapper input:checked ~ .checkbox-mark {
                background-color: #3C82F5;
            }

            .settings-ui .checkbox-mark:after {
                content: "";
                position: absolute;
                display: none;
            }

            .settings-ui .checkbox-wrapper input:checked ~ .checkbox-mark:after {
                display: block;
            }

            .settings-ui .checkbox-wrapper .checkbox-mark:after {
                left: 6px;
                top: 2.25px;
                width: 3px;
                height: 8px;
                border: solid #1e1e2e;
                border-width: 0 2px 2px 0;
                transform: rotate(45deg);
            }

            .settings-ui .select {
                background-color: inherit;
                color: #cdd6f4;
                border: 1px solid #313244;
                border-radius: 6px;
                padding: 8px 32px 8px 12px;
                font-size: 14px;
                cursor: pointer;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='%236c7086' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 12px center;
            }

            .settings-ui .select:focus {
                outline: none;
            }

            .settings-ui .button {
                background-color: #3C82F6;
                color: #0F172A;
                border: 1px solid #1E293B;
                border-radius: 6px;
                padding: 8px 16px;
                font-size: 14px;
                height: 37px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            .settings-ui .button:hover {
                background-color: rgba(57 128 242, 0.9);
            }

            .settings-ui .button:focus {
                outline: none;
            }
        </style>

        <div class="backdrop-blur hidden" id="backdrop_blur"></div>

        <div class="settings-ui hidden" id="settings_ui">
            <div class="header">
                <div class="side">
                    <img src="https://avatars.githubusercontent.com/u/116328501">
                    <h1>WispCraft</h1>
                </div>

                <div class="side" style="padding-right:1rem;color:rgba(248,250,252,0.8);">
                    <svg id="close" onclick="document.querySelector('.settings-ui').classList.add('hidden');document.querySelector('.backdrop-blur').classList.add('hidden');" xmlns="http://www.w3.org/2000/svg" width="24" height="24" stroke="currentColor" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </div>
            </div>

            <div class="tabs">
                <span class="selected" id="settings_tab">Settings</span>
                <span id="auth_tab">Auth</span>
            </div>

            <div class="content shown"  id="settings">
                <div class="setting">
                    <p>Wisp Server</p>
                    <input class="input" placeholder="wss://anura.pro/" />
                </div>
                <button class="button">Save</button>
            </div>

            <div class="content hidden" id="auth">
                <div class="setting">
                    <p>Microsoft Accounts</p>
                    <select name="pets" id="pet-select" class="select">
                        <option selected disabled>Choose an account</option>
                    </select>
                </div>

                <div class="setting">
                    <p>Remember Me</p>
                    <label class="checkbox-wrapper">
                        <input type="checkbox">
                        <span class="checkbox-mark"></span>
                    </label>
                </div>
            </div>
        </div>`;

	document.body.insertAdjacentHTML("beforeend", ui);

	const settings = document.querySelector("#settings");
	const auth = document.querySelector("#auth");

	const settingsTab = document.querySelector("#settings_tab");
	const authTab = document.querySelector("#auth_tab");

	settingsTab.onclick = () => {
		const tabs = document.querySelectorAll(".tabs span");
		const pages = document.querySelectorAll(".settings-ui .content");

		for (const tab of tabs) {
			tab.classList.remove("selected");
		}

		for (const page of pages) {
			page.classList.remove("shown");
			page.classList.add("hidden");
		}

		settings.classList.remove("hidden");
		settings.classList.add("shown");
		settingsTab.classList.add("selected");
	};

	authTab.onclick = () => {
		const tabs = document.querySelectorAll(".tabs span");
		const pages = document.querySelectorAll(".settings-ui .content");

		for (const tab of tabs) {
			tab.classList.remove("selected");
		}

		for (const page of pages) {
			page.classList.remove("shown");
			page.classList.add("hidden");
		}

		auth.classList.remove("hidden");
		auth.classList.add("shown");
		authTab.classList.add("selected");
	};
}

export function showUI(args) {
	const settingsUi = document.querySelector(".settings-ui");
	if (!settingsUi) {
		createUI();
		return showUI(args);
	}
	settingsUi.classList.remove("hidden");
	document.querySelector(".backdrop-blur").classList.remove("hidden");
}
