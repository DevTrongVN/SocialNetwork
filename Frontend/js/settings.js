const BASE_URL = "";
let myProfile = null;

window.onload = async function() {
    const token = localStorage.getItem("jwtToken");
    if (!token) { window.location.href = "index.html"; return; }

    try {
        myProfile = await fetch(`${BASE_URL}/api/user/me`, {
            headers: { "Authorization": "Bearer " + token }
        }).then(res => res.json());

        // Đổ dữ liệu
        document.getElementById("set-username").value = myProfile.username;
        document.getElementById("set-email").value = myProfile.email;
        document.getElementById("set-bio").value = myProfile.bio || "";

        // Hiển thị Avatar
        const avatarBox = document.getElementById("settings-avatar-preview");
        if (myProfile.avatarUrl) {
            const fullImgUrl = myProfile.avatarUrl.startsWith('http') ? myProfile.avatarUrl : BASE_URL + myProfile.avatarUrl;
            avatarBox.innerHTML = `<img src="${fullImgUrl}" class="w-full h-full object-cover">`;
        } else {
            avatarBox.innerText = myProfile.username.substring(0,2).toUpperCase();
        }

        // Hiển thị Cover
        if (myProfile.coverUrl) {
            const fullCoverUrl = myProfile.coverUrl.startsWith('http') ? myProfile.coverUrl : BASE_URL + myProfile.coverUrl;
            document.getElementById("settings-cover-preview").innerHTML = `<img src="${fullCoverUrl}" class="w-full h-full object-cover">`;
        }

        if(document.getElementById("set-profile-visibility")) document.getElementById("set-profile-visibility").value = myProfile.profileVisibility;
        if(document.getElementById("set-friend-visibility")) document.getElementById("set-friend-visibility").value = myProfile.friendListVisibility;
        if(document.getElementById("set-post-visibility")) document.getElementById("set-post-visibility").value = myProfile.postDefaultVisibility;

    } catch (e) { console.error("Lỗi:", e); }

    openTab('general'); 
};

function openTab(tabName) {
    ['general', 'privacy', 'block'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const content = document.getElementById(`content-${t}`);
        if (t === tabName) {
            btn.className = "w-full text-left flex items-center gap-3 p-3 rounded-lg bg-blue-50 text-primary font-bold transition";
            content.classList.remove("hidden");
        } else {
            btn.className = "w-full text-left flex items-center gap-3 p-3 rounded-lg text-themeText hover:bg-themeBg transition";
            content.classList.add("hidden");
        }
    });
    if (tabName === 'block') loadBlockedUsers();
}

async function saveSettings(payload) {
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/user/settings`, {
            method: "PUT", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.token) localStorage.setItem("jwtToken", data.token);
        alert(data.message);
        window.location.reload(); 
    } catch (e) { alert("Lỗi kết nối!"); }
}

function saveGeneralSettings() {
    const profileVis = document.getElementById("set-profile-visibility") ? document.getElementById("set-profile-visibility").value : 0;
    const friendVis = document.getElementById("set-friend-visibility") ? document.getElementById("set-friend-visibility").value : 0;
    const postVis = document.getElementById("set-post-visibility") ? document.getElementById("set-post-visibility").value : 0;

    saveSettings({
        username: document.getElementById("set-username").value,
        bio: document.getElementById("set-bio").value, // THÊM TIỂU SỬ VÀO ĐÂY
        profileVisibility: parseInt(profileVis),
        friendListVisibility: parseInt(friendVis),
        postDefaultVisibility: parseInt(postVis)
    });
}

function savePrivacySettings() { saveGeneralSettings(); }

async function handleAvatarSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const token = localStorage.getItem("jwtToken");
    const formData = new FormData(); formData.append("file", file);
    try {
        const uploadRes = await fetch(`${BASE_URL}/api/upload/image`, { method: "POST", headers: { "Authorization": "Bearer " + token }, body: formData });
        if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            const avatarRes = await fetch(`${BASE_URL}/api/user/avatar`, {
                method: "PUT", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ avatarUrl: uploadData.url })
            });
            if (avatarRes.ok) {
                alert("Cập nhật ảnh đại diện thành công!");
                window.location.reload();
            }
        }
    } catch (e) { console.error(e); }
}

async function handleCoverSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const token = localStorage.getItem("jwtToken");
    const formData = new FormData(); formData.append("file", file);
    try {
        const uploadRes = await fetch(`${BASE_URL}/api/upload/image`, { method: "POST", headers: { "Authorization": "Bearer " + token }, body: formData });
        if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            const coverRes = await fetch(`${BASE_URL}/api/user/cover`, {
                method: "PUT", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ coverUrl: uploadData.url })
            });
            if (coverRes.ok) {
                alert("Cập nhật ảnh bìa thành công!");
                window.location.reload();
            }
        }
    } catch (e) { console.error(e); }
}

async function changePassword() {
    const oldPass = document.getElementById("old-password").value;
    const newPass = document.getElementById("new-password").value;
    if (!oldPass || !newPass) { alert("Vui lòng nhập đủ!"); return; }

    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/user/password`, {
            method: "PUT", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem("jwtToken", data.token);
            alert(data.message);
            document.getElementById("old-password").value = "";
            document.getElementById("new-password").value = "";
        } else { alert(data.message); }
    } catch (e) { alert("Mất kết nối!"); }
}

function loadBlockedUsers() {
    const token = localStorage.getItem("jwtToken");
    fetch(`${BASE_URL}/api/block/list`, { headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json()).then(users => {
        const container = document.getElementById("blockListContainer");
        container.innerHTML = "";
        if (users.length === 0) return container.innerHTML = `<div class="bg-themeBg p-6 rounded-xl text-center text-themeSub border border-themeBorder font-medium">Bạn chưa chặn ai cả.</div>`;
        users.forEach(u => {
            container.innerHTML += `
                <div class="flex items-center justify-between bg-themeBg p-4 rounded-xl border border-themeBorder shadow-sm">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-red-100 text-red-500 font-bold flex items-center justify-center text-lg">${u.username.substring(0,2).toUpperCase()}</div>
                        <div class="font-bold text-themeText">${u.username}</div>
                    </div>
                    <button onclick="unblockUser('${u.id}')" class="bg-themePanel hover:bg-gray-200 text-themeText border border-themeBorder font-bold py-2 px-4 rounded-lg transition text-sm">Bỏ chặn</button>
                </div>`;
        });
    });
}

function unblockUser(targetId) {
    if (!confirm("Bạn có chắc chắn muốn bỏ chặn?")) return;
    const token = localStorage.getItem("jwtToken");
    fetch(`${BASE_URL}/api/block/unblock/${targetId}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } }).then(() => loadBlockedUsers());
}