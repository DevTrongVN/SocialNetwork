const BASE_URL_GLOBAL = "";
let globalNotifCount = 0;

// HỆ THỐNG MENTION (TAG TÊN BẠN BÈ) TOÀN CỤC
let MY_GLOBAL_PROFILE_DATA = null;

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
    return `<div class="${sizeClass} rounded-full bg-blue-100 text-primary font-bold flex items-center justify-center flex-shrink-0 ${textClass}">${(username || 'U').substring(0,2).toUpperCase()}</div>`;
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
    list.innerHTML = "";
    
    if (notifs.length === 0) {
        list.innerHTML = `<div class="p-4 text-center text-sm text-themeSub italic">Bạn chưa có thông báo nào.</div>`;
        return;
    }

    notifs.forEach(n => {
        const bgClass = n.isRead ? "bg-themePanel" : "bg-blue-50 dark:bg-gray-800";
        const timeStr = new Date(n.createdAt).toLocaleString('vi-VN');
        
        let link = "#";
        if (n.type === "Like" || n.type === "Reaction" || n.type === "Comment" || n.type === "Share" || n.type === "Tag") {
            link = `profile.html?id=${n.userId}#post-${n.relatedId}`;
        } else if (n.type === "Friend") {
            link = `profile.html?id=${n.senderId}&tab=requests`;
        }else if (n.type === "Chat") {
            link = `chat.html?targetId=${n.senderId}`;
        }

        list.innerHTML += `
            <a href="${link}" class="block p-3 border-b border-themeBorder text-sm text-themeText transition hover:opacity-80 ${bgClass}">
                <div class="flex items-start gap-3">
                    <div class="mt-1 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-bell text-primary"></i>
                    </div>
                    <div>
                        <div class="font-medium">${n.content}</div>
                        <div class="text-[10.5px] text-themeSub mt-1"><i class="fa-regular fa-clock mr-1"></i>${timeStr}</div>
                    </div>
                </div>
            </a>`;
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("jwtToken");
    if (token && window.location.pathname.indexOf("index.html") === -1) {
        
        loadNotifications(token);
        const globalConnection = new signalR.HubConnectionBuilder()
            .withUrl(`${BASE_URL_GLOBAL}/chathub`, { accessTokenFactory: () => token })
            .withAutomaticReconnect().build();

        // 1. LẮNG NGHE THÔNG BÁO CHUNG (LIKE, COMMENT, TAG...)
        globalConnection.on("ReceiveNotification", function (content, type, senderId, relatedId) {
            globalNotifCount++;
            renderNotifBadge();
            loadNotifications(token);

            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => console.log("Trình duyệt chặn tự động phát âm thanh"));

            const toast = document.createElement("div");
            toast.className = "fixed bottom-4 left-4 bg-themePanel border border-themeBorder shadow-2xl p-4 rounded-xl flex items-start gap-3 z-[9999] transform transition-all translate-y-10 opacity-0 duration-300";
            
            let link = "#";
            if (type === "Like" || type === "Reaction" || type === "Comment" || type === "Share" || type === "Tag") link = `profile.html?id=${senderId}#post-${relatedId}`;
            else if (type === "Friend") link = `profile.html?id=${senderId}&tab=requests`;

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

        // 2. MẮT THẦN MỚI: LẮNG NGHE TIN NHẮN TỪ MỌI NƠI
        globalConnection.on("ReceiveMessage", function (messageId, senderId, senderName, encryptedMessage, isRecalled) {
            // Đang ở trang Chat và đang mở đúng đoạn hội thoại đó thì KHÔNG hiện thông báo ngoài
            const isChatPage = window.location.pathname.includes('chat.html');
            if (isChatPage && typeof currentChatTarget !== 'undefined' && currentChatTarget && currentChatTarget.id === senderId) {
                return;
            }

            globalNotifCount++;
            renderNotifBadge();

            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => {});

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

let searchTimeout;
function handleGlobalSearch(keyword) {
    const dropdown = document.getElementById("searchDropdown");
    if (!keyword.trim()) { dropdown.classList.add("hidden"); return; }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const token = localStorage.getItem("jwtToken");
        try {
            const res = await fetch(`${BASE_URL_GLOBAL}/api/user/search-users?keyword=${encodeURIComponent(keyword)}`, {
                headers: { "Authorization": "Bearer " + token }
            });
            if (res.ok) {
                const users = await res.json();
                dropdown.innerHTML = "";
                if (users.length === 0) dropdown.innerHTML = `<div class="p-3 text-sm text-themeSub text-center">Không tìm thấy ai tên '${keyword}'</div>`;
                else {
                    users.forEach(u => {
                        dropdown.innerHTML += `
                            <div onclick="location.href='profile.html?id=${u.id}'" class="flex items-center gap-3 p-3 hover:bg-themeBg cursor-pointer transition border-b border-themeBorder last:border-0">
                                ${getAvatarHtml(u.avatarUrl, u.username, "w-8 h-8", "text-xs")}
                                <div class="font-bold text-themeText text-sm">${u.username}</div>
                            </div>
                        `;
                    });
                }
                dropdown.classList.remove("hidden");
            }
        } catch (e) { }
    }, 300);
}

document.addEventListener("click", function(e) {
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
const EMOJI_LIST = ["😀","😂","🤣","😊","😍","🥰","😘","😜","😎","🤩","😢","😭","😡","🤬","🤯","😱","🥶","👍","👎","👏","🤝","🔥","✨","🎉","💯","❤️","💔"];
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
            if(!picker.contains(e.target) && !e.target.closest('.emoji-btn')) picker.classList.add("hidden");
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
            if(!picker.contains(e.target) && !e.target.closest('.mention-btn')) picker.classList.add("hidden");
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

document.addEventListener('keydown', function(e) {
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