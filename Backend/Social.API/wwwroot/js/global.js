const BASE_URL_GLOBAL = "";
let globalNotifCount = 0;

// HỆ THỐNG MENTION (TAG TÊN BẠN BÈ) TOÀN CỤC
let MY_GLOBAL_PROFILE_DATA = null;

// HỆ THỐNG TÌM KIẾM & LỊCH SỬ (GLOBAL)

let searchTimeout = null;

// Hàm định dạng chữ: Biến @[Tên](ID) thành Link màu xanh
function formatMentions(text) {
    if (!text) return "";
    return text.replace(/@\[(.*?)\]\((.*?)\)/g, '<a href="profile.html?id=$2" class="text-primary font-bold hover:underline z-10 relative">@$1</a>');
}

// HÀM DÙNG CHUNG ĐỂ VẼ AVATAR TRÊN TOÀN HỆ THỐNG
function getAvatarHtml(avatarUrl, username, sizeClass = "w-10 h-10", textClass = "text-base") {
    if (avatarUrl) {
        const fullUrl = avatarUrl.startsWith('http') ? avatarUrl : BASE_URL_GLOBAL + avatarUrl;
        return `<img src="${fullUrl}" class="${sizeClass} rounded-full object-cover border border-themeBorder flex-shrink-0">`;
    }
    return `<div class="${sizeClass} rounded-full bg-blue-100 text-primary font-bold flex items-center justify-center flex-shrink-0 ${textClass}">${(username || 'U').substring(0, 2).toUpperCase()}</div>`;
}

function logout() {
    localStorage.removeItem("jwtToken");
    window.location.href = "index.html";
}

function toggleNotifDropdown() {
    const dropdown = document.getElementById("notifDropdown");
    if (dropdown) {
        dropdown.classList.toggle("hidden");
        if (!dropdown.classList.contains("hidden") && globalNotifCount > 0) {
            const token = localStorage.getItem("jwtToken");
            fetch(`${BASE_URL_GLOBAL}/api/notification/read-all`, {
                method: "PUT", headers: { "Authorization": "Bearer " + token }
            }).then(() => {
                globalNotifCount = 0;
                renderNotifBadge();
                loadNotifications(token);
            });
        }
    }
}

async function loadNotifications(token) {
    try {
        const res = await fetch(`${BASE_URL_GLOBAL}/api/notification`, {
            headers: { "Authorization": "Bearer " + token }
        });
        if (res.ok) {
            const data = await res.json();
            globalNotifCount = data.unreadCount;
            renderNotifBadge();
            renderNotifList(data.notifications);
        }
    } catch (e) { console.error(e); }
}

function renderNotifBadge() {
    const badge = document.getElementById("notifBadge");
    if (badge) {
        if (globalNotifCount > 0) {
            badge.innerText = globalNotifCount;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }
}

function renderNotifList(notifs) {
    const list = document.getElementById("notifList");
    if (!list) return;

    if (!notifs || notifs.length === 0) {
        list.innerHTML = `<div class="p-4 text-center text-sm text-themeSub italic">Bạn chưa có thông báo nào.</div>`;
        return;
    }

    let html = "";
    notifs.forEach(n => {
        let icon = '<i class="fa-solid fa-bell text-blue-500"></i>';

        // ĐÃ SỬA: Thêm "n." vào trước các biến
        let link = "#";
        if (n.type === "Like" || n.type === "Reaction" || n.type === "Comment") {
            link = `profile.html?id=${n.userId}#post-${n.relatedId}`;
        } else if (n.type === "Share" || n.type === "Tag" || n.type === "Reply") {
            link = `profile.html?id=${n.senderId}#post-${n.relatedId}`;
        } else if (n.type === "Friend") {
            link = `profile.html?id=${n.senderId}&tab=requests`;
        } else if (n.type === "Chat") {
            link = `chat.html?targetId=${n.senderId}`;
        } else if (n.type === "GroupChat") {
            link = `chat.html?groupId=${n.relatedId}`;
        }

        if (n.type === "Like" || n.type === "Reaction") icon = '<i class="fa-solid fa-heart text-red-500"></i>';
        else if (n.type === "Comment" || n.type === "Reply") icon = '<i class="fa-solid fa-comment text-blue-500"></i>';
        else if (n.type === "Share") icon = '<i class="fa-solid fa-share text-green-500"></i>';
        else if (n.type === "Tag") icon = '<i class="fa-solid fa-at text-purple-500"></i>';
        else if (n.type === "Friend") icon = '<i class="fa-solid fa-user-plus text-primary"></i>';
        else if (n.type === "Chat" || n.type === "GroupChat") icon = '<i class="fa-solid fa-envelope text-yellow-500"></i>';

        const bgClass = n.isRead ? "bg-themePanel" : "bg-blue-50 dark:bg-blue-900/20";

        html += `
            <a href="${link}" class="flex items-start gap-3 p-3 border-b border-themeBorder hover:bg-themeBg transition ${bgClass}">
                <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center text-xl">
                    ${icon}
                </div>
                <div class="flex-1">
                    <p class="text-sm text-themeText line-clamp-2">${n.content}</p>
                    <p class="text-xs text-themeSub mt-1">${new Date(n.createdAt).toLocaleString('vi-VN')}</p>
                </div>
                ${!n.isRead ? '<div class="w-2 h-2 rounded-full bg-primary mt-2"></div>' : ''}
            </a>
        `;
    });
    list.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("jwtToken");
    if (token && window.location.pathname.indexOf("index.html") === -1) {

        loadNotifications(token);
        const globalConnection = new signalR.HubConnectionBuilder()
            .withUrl(`${BASE_URL_GLOBAL}/chathub`, { accessTokenFactory: () => token })
            .withAutomaticReconnect().build();

        // 1. LẮNG NGHE THÔNG BÁO CHUNG (LIKE, COMMENT, TAG...)
        globalConnection.on("ReceiveNotification", function(content, type, senderId, relatedId) {
            globalNotifCount++;
            renderNotifBadge();
            loadNotifications(token);

            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => console.log("Trình duyệt chặn tự động phát âm thanh"));

            const toast = document.createElement("div");
            toast.className = "fixed bottom-4 left-4 bg-themePanel border border-themeBorder shadow-2xl p-4 rounded-xl flex items-start gap-3 z-[9999] transform transition-all translate-y-10 opacity-0 duration-300";

            let link = "#";
            if (type === "Like" || type === "Reaction" || type === "Comment") {
                link = `profile.html?id=${MY_GLOBAL_PROFILE_DATA.id}#post-${relatedId}`;
            } else if (type === "Share" || type === "Tag" || type === "Reply") {
                link = `profile.html?id=${senderId}#post-${relatedId}`;
            } else if (type === "Friend") {
                link = `profile.html?id=${senderId}&tab=requests`;
            } else if (type === "Chat") {
                link = `chat.html?targetId=${senderId}`;
            } else if (type === "GroupChat") {
                // ĐÃ THÊM: Chỉ đường vào thẳng URL của Nhóm
                link = `chat.html?groupId=${relatedId}`;
            }

            toast.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-primary">
                    <i class="fa-solid fa-bell"></i>
                </div>
                <div class="cursor-pointer" onclick="location.href='${link}'">
                    <div class="font-bold text-themeText text-sm mb-1">Thông báo mới</div>
                    <div class="text-xs text-themeSub">${content}</div>
                </div>
                <button class="ml-2 text-themeSub hover:text-red-500" onclick="this.parentElement.remove()"><i class="fa-solid fa-times"></i></button>
            `;

            document.body.appendChild(toast);
            setTimeout(() => { toast.classList.remove("translate-y-10", "opacity-0"); }, 10);
            setTimeout(() => { toast.classList.add("translate-y-10", "opacity-0"); setTimeout(() => toast.remove(), 300); }, 5000);
        });

        // 2. MẮT THẦN LẮNG NGHE TIN NHẮN TỪ MỌI NƠI (1-1)
        globalConnection.on("ReceiveMessage", function(messageId, senderId, senderName, encryptedMessage, isRecalled) {
            const isChatPage = window.location.pathname.includes('chat.html');
            if (isChatPage && typeof currentChatTarget !== 'undefined' && currentChatTarget && currentChatTarget.id === senderId) {
                return;
            }

            globalNotifCount++;
            renderNotifBadge();

            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => { });

            const toast = document.createElement("div");
            toast.className = "fixed bottom-4 left-4 bg-themePanel border border-themeBorder shadow-2xl p-4 rounded-xl flex items-start gap-3 z-[9999] transform transition-all translate-y-10 opacity-0 duration-300";

            toast.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-white">
                    <i class="fa-solid fa-envelope"></i>
                </div>
                <div class="cursor-pointer" onclick="location.href='chat.html?targetId=${senderId}'">
                    <div class="font-bold text-themeText text-sm mb-1">${senderName} đã gửi một tin nhắn</div>
                    <div class="text-xs text-themeSub italic">Nhấp để xem nội dung...</div>
                </div>
                <button class="ml-2 text-themeSub hover:text-red-500" onclick="this.parentElement.remove()"><i class="fa-solid fa-times"></i></button>
            `;

            document.body.appendChild(toast);
            setTimeout(() => { toast.classList.remove("translate-y-10", "opacity-0"); }, 10);
            setTimeout(() => { toast.classList.add("translate-y-10", "opacity-0"); setTimeout(() => toast.remove(), 300); }, 5000);
        });

        // 3. MẮT THẦN MỚI: LẮNG NGHE TIN NHẮN NHÓM
        globalConnection.on("ReceiveGroupMessage", function(groupId, messageId, senderId, senderName, encryptedMessage, isRecalled) {
            const isChatPage = window.location.pathname.includes('chat.html');
            // Nếu đang mở đúng tab nhóm đó thì không kêu
            if (isChatPage && typeof currentChatTarget !== 'undefined' && currentChatTarget && currentChatTarget.id === groupId) {
                return;
            }

            // Kêu âm thanh Ting Ting
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => { });

            // Hiện popup Toast màu tím (phân biệt với 1-1)
            const toast = document.createElement("div");
            toast.className = "fixed bottom-4 left-4 bg-themePanel border border-themeBorder shadow-2xl p-4 rounded-xl flex items-start gap-3 z-[9999] transform transition-all translate-y-10 opacity-0 duration-300";

            toast.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0 text-white">
                    <i class="fa-solid fa-users"></i>
                </div>
                <div class="cursor-pointer" onclick="location.href='chat.html'">
                    <div class="font-bold text-themeText text-sm mb-1">${senderName} (Nhóm)</div>
                    <div class="text-xs text-themeSub italic">Đã gửi tin nhắn vào nhóm. Nhấp để xem...</div>
                </div>
                <button class="ml-2 text-themeSub hover:text-red-500" onclick="this.parentElement.remove()"><i class="fa-solid fa-times"></i></button>
            `;

            document.body.appendChild(toast);
            setTimeout(() => { toast.classList.remove("translate-y-10", "opacity-0"); }, 10);
            setTimeout(() => { toast.classList.add("translate-y-10", "opacity-0"); setTimeout(() => toast.remove(), 300); }, 5000);
        });

        globalConnection.start().catch(err => console.log(err));

        fetch(`${BASE_URL_GLOBAL}/api/user/me`, { headers: { "Authorization": "Bearer " + token } })
            .then(res => res.json())
            .then(user => {
                MY_GLOBAL_PROFILE_DATA = user;
                const navMeBtn = document.querySelector('nav a[href="profile.html"]');
                if (navMeBtn) {
                    navMeBtn.outerHTML = `
                    <a href="profile.html" class="hover:opacity-80 transition cursor-pointer">
                        ${getAvatarHtml(user.avatarUrl, user.username, "w-10 h-10")}
                    </a>`;
                }

                if (user.role === "Admin") {
                    const bellIconContainer = document.querySelector('.fa-bell').closest('.relative');
                    if (bellIconContainer) {
                        const adminBtn = document.createElement('a');
                        adminBtn.href = "admin.html";
                        adminBtn.className = "ml-3 cursor-pointer hover:opacity-80 p-2 rounded-full transition duration-200";
                        adminBtn.innerHTML = `<i class="fa-solid fa-shield-halved text-xl text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]" title="Trang Quản Trị"></i>`;
                        bellIconContainer.parentNode.insertBefore(adminBtn, bellIconContainer.nextSibling);
                    }
                }
            }).catch(err => console.error(err));
    }

    if (document.getElementById("suggestedUsersContainer")) loadSuggestedUsers();
});

function loadSuggestedUsers() {
    const token = localStorage.getItem("jwtToken");
    if (!token) return;
    fetch(`${BASE_URL_GLOBAL}/api/user/suggested`, { headers: { "Authorization": "Bearer " + token } })
        .then(res => res.json()).then(users => {
            const container = document.getElementById("suggestedUsersContainer");
            if (!container) return;
            container.innerHTML = "";
            if (users.length === 0) return container.innerHTML = `<div class="text-xs text-themeSub italic text-center">Chưa có gợi ý.</div>`;
            users.forEach(user => {
                container.innerHTML += `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3 cursor-pointer overflow-hidden" onclick="location.href='profile.html?id=${user.id}'">
                        ${getAvatarHtml(user.avatarUrl, user.username, "w-9 h-9", "text-xs")}
                        <div class="font-bold text-themeText text-sm hover:underline truncate max-w-[120px]">${user.username}</div>
                    </div>
                    <button onclick="followSuggested('${user.id}', this)" class="text-primary text-xs font-bold hover:bg-themeBg px-3 py-1.5 rounded-lg transition border border-transparent hover:border-primary">Theo dõi</button>
                </div>`;
            });
        });
}

function followSuggested(targetId, btnElement) {
    const token = localStorage.getItem("jwtToken");
    btnElement.innerText = "Đã theo dõi";
    btnElement.className = "text-themeSub text-xs font-bold bg-themeBg px-3 py-1.5 rounded-lg border border-themeBorder cursor-not-allowed";
    btnElement.disabled = true;
    fetch(`${BASE_URL_GLOBAL}/api/follow/${targetId}`, { method: "POST", headers: { "Authorization": "Bearer " + token } });
}


document.addEventListener("click", function (e) {
    const dropdown = document.getElementById("searchDropdown");
    const searchInput = document.getElementById("globalSearchInput");
    if (dropdown && searchInput && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add("hidden");
    }
});

// ======================================================
// HỆ THỐNG REACTION
// ======================================================
const REACTION_CONFIG = {
    "Like": { icon: `👍`, text: "Thích", color: "text-primary" },
    "Love": { icon: `❤️`, text: "Yêu thích", color: "text-red-500" },
    "Haha": { icon: `😂`, text: "Haha", color: "text-yellow-500" },
    "Wow": { icon: `😮`, text: "Wow", color: "text-yellow-500" },
    "Sad": { icon: `😢`, text: "Buồn", color: "text-yellow-500" },
    "Angry": { icon: `😡`, text: "Phẫn nộ", color: "text-orange-500" }
};

function reactPost(postId, type) {
    const token = localStorage.getItem("jwtToken");
    fetch(`${BASE_URL_GLOBAL}/api/post/${postId}/react?type=${type}`, { method: "POST", headers: { "Authorization": "Bearer " + token } })
        .then(res => res.json())
        .then(data => {
            if (data.currentLikes !== undefined) {
                document.getElementById(`like-${postId}`).innerText = data.currentLikes;
                const btnElem = document.getElementById(`btn-like-${postId}`);
                const iconElem = document.getElementById(`reaction-icon-${postId}`);

                btnElem.className = "w-full py-2 hover:bg-themeBg rounded-lg transition font-medium text-center flex items-center justify-center gap-1";

                if (data.userReaction) {
                    const cfg = REACTION_CONFIG[data.userReaction];
                    btnElem.classList.add(...cfg.color.split(" "), "font-bold");
                    iconElem.innerHTML = `${cfg.icon} ${cfg.text}`;
                } else {
                    btnElem.classList.add("text-themeSub");
                    iconElem.innerHTML = `<i class="fa-solid fa-thumbs-up"></i> Thích`;
                }
            }
        });
}

// ======================================================
// HỆ THỐNG EMOJI PICKER
// ======================================================
const EMOJI_LIST = ["😀", "😂", "🤣", "😊", "😍", "🥰", "😘", "😜", "😎", "🤩", "😢", "😭", "😡", "🤬", "🤯", "😱", "🥶", "👍", "👎", "👏", "🤝", "🔥", "✨", "🎉", "💯", "❤️", "💔"];
let activeInputId = null;

function toggleEmojiPicker(inputId, btnElem) {
    let picker = document.getElementById("universalEmojiPicker");
    if (!picker) {
        picker = document.createElement("div");
        picker.id = "universalEmojiPicker";
        picker.className = "absolute z-50 bg-themePanel border border-themeBorder shadow-xl rounded-xl p-2 w-72 flex flex-wrap gap-1";
        picker.innerHTML = EMOJI_LIST.map(e => `<button onclick="insertEmoji('${e}')" class="text-2xl hover:bg-themeBg hover:scale-110 rounded p-1 transition transform">${e}</button>`).join("");
        document.body.appendChild(picker);

        document.addEventListener("click", (e) => {
            if (!picker.contains(e.target) && !e.target.closest('.emoji-btn')) picker.classList.add("hidden");
        });
    }

    if (activeInputId === inputId && !picker.classList.contains("hidden")) { picker.classList.add("hidden"); return; }

    activeInputId = inputId;
    picker.classList.remove("hidden");

    const rect = btnElem.getBoundingClientRect();
    let topPos = rect.top + window.scrollY - picker.offsetHeight - 10;
    if (topPos < 0) topPos = rect.bottom + window.scrollY + 10;
    picker.style.top = topPos + "px"; picker.style.left = rect.left + "px";
}

function insertEmoji(emoji) {
    if (!activeInputId) return;
    const input = document.getElementById(activeInputId);
    if (input) { input.value += emoji; input.focus(); }
}

// ======================================================
// HỆ THỐNG MENTION BẠN BÈ
// ======================================================
let activeMentionInputId = null;

async function toggleMentionPicker(inputId, btnElem) {
    let picker = document.getElementById("universalMentionPicker");
    const token = localStorage.getItem("jwtToken");

    if (!MY_GLOBAL_PROFILE_DATA) {
        MY_GLOBAL_PROFILE_DATA = await fetch(`${BASE_URL_GLOBAL}/api/user/me`, { headers: { "Authorization": "Bearer " + token } }).then(res => res.json());
    }

    if (!picker) {
        picker = document.createElement("div");
        picker.id = "universalMentionPicker";
        picker.className = "absolute z-50 bg-themePanel border border-themeBorder shadow-xl rounded-xl p-2 w-64 max-h-60 overflow-y-auto hidden flex-col gap-1";
        document.body.appendChild(picker);

        document.addEventListener("click", (e) => {
            if (!picker.contains(e.target) && !e.target.closest('.mention-btn')) picker.classList.add("hidden");
        });
    }

    if (activeMentionInputId === inputId && !picker.classList.contains("hidden")) {
        picker.classList.add("hidden"); return;
    }

    activeMentionInputId = inputId;
    picker.innerHTML = `<div class="text-center text-xs text-themeSub py-2"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải bạn bè...</div>`;
    picker.classList.remove("hidden");

    const rect = btnElem.getBoundingClientRect();
    let topPos = rect.top + window.scrollY - picker.offsetHeight - 10;
    if (topPos < 0) topPos = rect.bottom + window.scrollY + 10;
    picker.style.top = topPos + "px"; picker.style.left = rect.left + "px";

    const friends = await fetch(`${BASE_URL_GLOBAL}/api/friend/list/${MY_GLOBAL_PROFILE_DATA.id}`, { headers: { "Authorization": "Bearer " + token } }).then(res => res.json());

    picker.innerHTML = "";
    if (friends.length === 0) picker.innerHTML = `<div class="text-xs text-themeSub italic p-2">Bạn chưa có bạn bè để nhắc tên.</div>`;

    friends.forEach(f => {
        picker.innerHTML += `
            <div onclick="insertMention('${f.username}', '${f.id}')" class="flex items-center gap-3 p-2 hover:bg-themeBg cursor-pointer rounded-lg transition">
                ${getAvatarHtml(f.avatarUrl, f.username, "w-6 h-6", "text-[10px]")}
                <div class="font-bold text-themeText text-xs">${f.username}</div>
            </div>`;
    });
}

function insertMention(username, userId) {
    if (!activeMentionInputId) return;
    const input = document.getElementById(activeMentionInputId);
    if (input) {
        input.value += ` @[${username}](${userId}) `;
        input.focus();
        document.getElementById("universalMentionPicker").classList.add("hidden");
    }
}

// HỆ THỐNG PHÍM TẮT TOÀN CỤC (ACCESSIBILITY)

document.addEventListener('keydown', function (e) {
    // 1. Phím ESC: Tự động đóng rạp chiếu Story nếu nó đang mở
    if (e.key === 'Escape') {
        const modal = document.getElementById("storyViewerModal");
        if (modal && !modal.classList.contains("hidden")) {
            if (typeof closeStoryViewer === "function") closeStoryViewer();
        }
    }

    // 2. Phím Ctrl + Enter: Để đăng bài nhanh
    if (e.ctrlKey && e.key === 'Enter') {
        // Đăng bài viết (Trang Bảng tin)
        const postContent = document.getElementById('postContent');
        if (postContent && document.activeElement === postContent) {
            if (typeof submitPost === "function") submitPost();
        }
    }

});

// HỆ THỐNG TÌM KIẾM & LỊCH SỬ (GLOBAL)

function showSearchDropdown() {
    document.getElementById('searchDropdown').classList.remove('hidden');
    loadSearchHistory();
}

function hideSearchDropdown() {
    document.getElementById('searchDropdown').classList.add('hidden');
}

async function loadSearchHistory() {
    const token = localStorage.getItem("jwtToken");
    if (!token) return;

    document.getElementById("searchDropdownTitle").innerText = "Lịch sử tìm kiếm gần đây";
    const container = document.getElementById("searchResultList");
    container.innerHTML = `<div class="text-center text-themeSub py-4"><i class="fa-solid fa-spinner fa-spin text-xl"></i></div>`;

    try {
        const res = await fetch(`${BASE_URL_GLOBAL}/api/user/search-history`, { headers: { "Authorization": "Bearer " + token } });
        if (res.ok) {
            const history = await res.json();
            container.innerHTML = "";
            if (history.length === 0) {
                container.innerHTML = `<div class="p-4 text-center text-sm text-themeSub">Bạn chưa tìm kiếm gì gần đây.</div>`;
                return;
            }

            history.forEach(item => {
                if (item.targetUser) {
                    // Lịch sử là bấm vào trang cá nhân của một người
                    container.innerHTML += `
                        <div class="flex justify-between items-center p-2 hover:bg-themeBg transition group">
                            <div class="flex items-center gap-3 cursor-pointer flex-1" onclick="saveAndGoToProfile('${item.targetUser.id}')">
                                ${getSafeAvatar(item.targetUser.avatarUrl, item.targetUser.username, "w-10 h-10", "text-sm")}
                                <div class="font-bold text-themeText text-sm">${item.targetUser.username}</div>
                            </div>
                            <button onclick="deleteSearchHistory('${item.id}', event)" class="text-themeSub hover:text-red-500 p-2 hidden group-hover:block" title="Xóa lịch sử"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    `;
                } else {
                    // Lịch sử là một đoạn Text / Từ khóa
                    container.innerHTML += `
                        <div class="flex justify-between items-center p-2 hover:bg-themeBg transition group">
                            <div class="flex items-center gap-3 cursor-pointer flex-1 text-themeText text-sm font-medium" onclick="document.getElementById('globalSearchInput').value='${item.keyword}'; handleGlobalSearch('${item.keyword}')">
                                <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-themeSub"><i class="fa-solid fa-clock-rotate-left"></i></div>
                                <span class="flex-1 line-clamp-1">${item.keyword}</span>
                            </div>
                            <button onclick="deleteSearchHistory('${item.id}', event)" class="text-themeSub hover:text-red-500 p-2 hidden group-hover:block" title="Xóa lịch sử"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    `;
                }
            });
        }
    } catch (e) { console.error("Lỗi lấy lịch sử tìm kiếm:", e); }
}

async function handleGlobalSearch(keyword) {
    if (!keyword.trim()) { loadSearchHistory(); return; }

    document.getElementById("searchDropdownTitle").innerText = "Kết quả tìm kiếm cho: " + keyword;
    const container = document.getElementById("searchResultList");
    container.innerHTML = `<div class="text-center text-themeSub py-4"><i class="fa-solid fa-spinner fa-spin text-xl"></i></div>`;

    // Dùng Debounce: Đợi người dùng gõ xong 0.5s mới gọi API để đỡ lag Server
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const token = localStorage.getItem("jwtToken");
        try {
            const res = await fetch(`${BASE_URL_GLOBAL}/api/user/search-users?keyword=${encodeURIComponent(keyword)}`, { headers: { "Authorization": "Bearer " + token } });
            if (res.ok) {
                const users = await res.json();
                container.innerHTML = "";
                if (users.length === 0) {
                    container.innerHTML = `<div class="p-4 text-center text-sm text-themeSub">Không tìm thấy người dùng nào khớp với "${keyword}".</div>`;
                    // Dù không tìm thấy ai, vẫn lưu từ khóa text này lại làm lịch sử
                    saveSearchHistory(keyword, null);
                    return;
                }

                users.forEach(u => {
                    container.innerHTML += `
                        <div class="flex items-center gap-3 p-2 hover:bg-themeBg cursor-pointer transition" onclick="saveAndGoToProfile('${u.id}')">
                            ${getSafeAvatar(u.avatarUrl, u.username, "w-10 h-10", "text-sm")}
                            <div class="font-bold text-themeText text-sm">${u.username}</div>
                        </div>
                    `;
                });
            }
        } catch (e) { console.error("Lỗi tìm kiếm:", e); }
    }, 500);
}

async function saveSearchHistory(keyword, targetId) {
    const token = localStorage.getItem("jwtToken");
    if (!token) return;
    try {
        await fetch(`${BASE_URL_GLOBAL}/api/user/search-history`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ keyword: keyword, targetUserId: targetId })
        });
    } catch (e) { console.error("Lỗi lưu lịch sử:", e); }
}

function saveAndGoToProfile(userId) {
    // Lưu lịch sử (người dùng vừa bấm vào ai đó) rồi chuyển hướng sang trang Profile
    saveSearchHistory(null, userId).then(() => {
        window.location.href = `profile.html?id=${userId}`;
    });
}

async function deleteSearchHistory(historyId, event) {
    event.stopPropagation(); // Ngăn click nhầm chuyển trang
    const token = localStorage.getItem("jwtToken");
    try {
        await fetch(`${BASE_URL_GLOBAL}/api/user/search-history/${historyId}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
        loadSearchHistory(); // Refresh lại danh sách hiển thị
    } catch (e) { console.error("Lỗi xóa lịch sử:", e); }
}