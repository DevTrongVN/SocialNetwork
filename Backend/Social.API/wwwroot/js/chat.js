const BASE_URL = "";
let connection;
let myProfile = null;
let currentChatTarget = null;
let currentSecretKey = "";
let currentReplyToMessage = null;

let loadHistoryTimeout;
let typingTimeout;
let isTyping = false;
let fullDecryptedHistory = [];
let groupTypingUsers = new Set();

let rtcPeerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallTargetId = null;
let isVideoCallActive = false;

let isCaller = false;
let callStartTime = null;
let callTimeoutId = null;

let lastMessageDate = null;
function getSafeAvatar(avatarUrl, username, sizeClass = "w-10 h-10", textClass = "text-base") {
    if (avatarUrl) {
        const fullUrl = avatarUrl.startsWith('http') ? avatarUrl : BASE_URL + avatarUrl;
        return `<img src="${fullUrl}" class="${sizeClass} rounded-full object-cover border border-themeBorder flex-shrink-0">`;
    }
    return `<div class="${sizeClass} rounded-full bg-blue-100 text-primary font-bold flex items-center justify-center flex-shrink-0 ${textClass}">${(username || 'U').substring(0, 2).toUpperCase()}</div>`;
}

window.onload = async function () {
    const token = localStorage.getItem("jwtToken");
    if (!token) { window.location.href = "index.html"; return; }

    try {
        myProfile = await fetch(`${BASE_URL}/api/user/me`, {
            headers: { "Authorization": "Bearer " + token }
        }).then(res => res.json());
        const navAvatar = document.querySelector('nav a[href="profile.html"] div');
        if (navAvatar && myProfile) navAvatar.outerHTML = getSafeAvatar(myProfile.avatarUrl, myProfile.username, "w-10 h-10 shadow-sm", "text-base");
    } catch (e) { console.error("Lỗi lấy Profile:", e); }



    loadFriendList(token);
    await initSignalR(token);
    
    

    const urlParams = new URLSearchParams(window.location.search);
    const autoTargetId = urlParams.get("targetId");
    if (autoTargetId) {
        autoStartChat(autoTargetId, token);
    }

    //Tự động mở Nhóm Chat khi bấm từ Chuông thông báo
    const autoGroupId = urlParams.get("groupId");
    if (autoGroupId) {
        autoStartGroupChat(autoGroupId, token);
    }
    const msgInput = document.getElementById("messageInput");
    if (msgInput) {
        msgInput.addEventListener("input", function () {
            if (!currentChatTarget || !connection || connection.state !== "Connected") return;
            if (!isTyping) {
                isTyping = true;
                if (currentChatTarget.isGroup) connection.invoke("SendGroupTypingState", currentChatTarget.id, true).catch(console.error);
                else connection.invoke("SendTypingState", currentChatTarget.id, true).catch(console.error);
            }
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                isTyping = false;
                if (currentChatTarget.isGroup) connection.invoke("SendGroupTypingState", currentChatTarget.id, false).catch(console.error);
                else connection.invoke("SendTypingState", currentChatTarget.id, false).catch(console.error);
            }, 2000);
        });

        msgInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
            }
        });
    }
};

function startGroupChatWith(group) {
    try {
        currentChatTarget = group;
        document.getElementById("btnAudioCall").classList.add("hidden");
        document.getElementById("btnVideoCall").classList.add("hidden");
        groupTypingUsers.clear();
        // Mẹo E2EE cho nhóm: Mọi thành viên nhóm đều dùng chung Secret Key cấu thành từ ID nhóm
        currentSecretKey = "group_" + group.id;

        const chatBox = document.getElementById("chatMessages");
        if (chatBox) chatBox.innerHTML = `<div id="loading-spinner" class="text-center text-themeSub text-xs py-10"><i class="fa-solid fa-spinner fa-spin text-xl mb-2"></i><br>Đang tải tin nhắn nhóm...</div>`;

        const chatInfo = document.getElementById("currentChatInfo"); if (chatInfo) chatInfo.classList.remove("hidden");
        const targetName = document.getElementById("chatTargetName");
        if (targetName) {
            targetName.innerHTML = `<div class="flex items-center gap-2"><div class="w-6 h-6 rounded-full bg-purple-100 text-purple-600 font-bold flex items-center justify-center text-xs"><i class="fa-solid fa-users"></i></div><span>${group.name}</span></div>`;
        }

        const placeholder = document.getElementById("chatPlaceholder"); if (placeholder) placeholder.style.display = "none";
        document.getElementById("messageInput").disabled = false; document.getElementById("btnSend").disabled = false;

        if (connection && connection.state === "Connected") {
            connection.invoke("LoadGroupHistory", group.id).catch(console.error);
        }
    } catch (error) { console.error("Lỗi mở nhóm chat:", error); }
}

async function loadFriendList(token) {
    const container = document.getElementById("friendListContainer");
    if (!container) return;
    container.innerHTML = `<div class="text-center py-10 text-themeSub"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh bạ...</div>`;

    try {
        // 1. Tải danh sách chat 1-1
        const resChats = await fetch(`${BASE_URL}/api/user/recent-chats`, { headers: { "Authorization": "Bearer " + token } });
        const contacts = resChats.ok ? await resChats.json() : [];

        // 2. Tải danh sách Nhóm chat
        const resGroups = await fetch(`${BASE_URL}/api/group/my-groups`, { headers: { "Authorization": "Bearer " + token } });
        const groups = resGroups.ok ? await resGroups.json() : [];

        container.innerHTML = "";

        if (contacts.length === 0 && groups.length === 0) {
            container.innerHTML = `<div class="text-center text-themeSub text-sm p-4">Chưa có tin nhắn hoặc nhóm nào.</div>`;
            return;
        }

        // Render Nhóm Chat trước (nếu có)
        if (groups.length > 0) {
            container.innerHTML += `<div class="px-3 py-1.5 text-[11px] font-bold text-themeSub uppercase tracking-wider bg-themeBg/50 border-y border-themeBorder">Nhóm của bạn (${groups.length})</div>`;
            groups.forEach(g => {
                container.innerHTML += `
                    <div onclick="startGroupChatWith({id: '${g.id}', name: '${g.name}', avatarUrl: '${g.avatarUrl || ''}', isGroup: true})" class="flex items-center gap-3 p-3 hover:bg-themeBg rounded-lg cursor-pointer transition border-b border-themeBorder">
                        <div class="w-10 h-10 rounded-full bg-purple-100 text-purple-600 font-bold flex items-center justify-center flex-shrink-0 text-lg border border-purple-200">
                            <i class="fa-solid fa-users"></i>
                        </div>
                        <div class="font-bold text-themeText flex-1 truncate text-sm">${g.name}</div>
                    </div>`;

                // Đăng ký SignalR Lắng nghe Tần số của Nhóm này
                if (connection && connection.state === "Connected") {
                    connection.invoke("JoinGroup", g.id).catch(console.error);
                }
            });
        }

        // Render Bạn bè/Chat 1-1
        if (contacts.length > 0) {
            container.innerHTML += `<div class="px-3 py-1.5 text-[11px] font-bold text-themeSub uppercase tracking-wider bg-themeBg/50 border-y border-themeBorder">Trò chuyện riêng (${contacts.length})</div>`;
            contacts.forEach(c => {
                const strangerBadge = !c.isFriend ? `<span class="bg-gray-200 dark:bg-gray-700 text-themeSub px-2 py-0.5 rounded text-[10px] ml-2">Người lạ</span>` : '';
                container.innerHTML += `
                    <div onclick="startChatWith({id: '${c.id}', username: '${c.username}', avatarUrl: '${c.avatarUrl}'})" class="flex items-center gap-3 p-3 hover:bg-themeBg rounded-lg cursor-pointer transition border-b border-themeBorder">
                        ${getSafeAvatar(c.avatarUrl, c.username, "w-10 h-10", "text-sm")}
                        <div class="font-bold text-themeText flex-1 truncate text-sm flex items-center">${c.username} ${strangerBadge}</div>
                    </div>`;
            });
        }

    } catch (e) { console.error("Lỗi tải danh bạ:", e); }
}

async function autoStartChat(targetId, token) {
    try {
        const res = await fetch(`${BASE_URL}/api/user/profile/${targetId}`, { headers: { "Authorization": "Bearer " + token } });
        if (res.ok) { const user = await res.json(); startChatWith(user); }
    } catch (e) { console.error(e); }
}

async function autoStartGroupChat(groupId, token) {
    try {
        const res = await fetch(`${BASE_URL}/api/group/my-groups`, { headers: { "Authorization": "Bearer " + token } });
        if (res.ok) {
            const groups = await res.json();
            const targetGroup = groups.find(g => g.id === groupId);
            if (targetGroup) {
                // Bấm vào phát là nhảy vô phòng chat nhóm luôn!
                startGroupChatWith({ id: targetGroup.id, name: targetGroup.name, avatarUrl: targetGroup.avatarUrl, isGroup: true });
            }
        }
    } catch (e) { console.error("Lỗi tự động mở nhóm:", e); }
}

async function searchUser() {
    const searchElem = document.getElementById("searchEmail"); if (!searchElem) return;
    const email = searchElem.value.trim(); if (!email) return;
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/user/search?email=${encodeURIComponent(email)}`, { headers: { "Authorization": "Bearer " + token } });
        if (res.ok) {
            const user = await res.json();
            if (user.id === myProfile.id) { alert("Bạn không thể tự chat với chính mình!"); return; }
            startChatWith(user);
        } else { alert("Không tìm thấy người dùng có Email này!"); }
    } catch (e) { alert("Lỗi mạng!"); }
}

function startChatWith(user) {
    try {
        currentChatTarget = user;
        document.getElementById("btnAudioCall").classList.remove("hidden");
        document.getElementById("btnVideoCall").classList.remove("hidden");
        groupTypingUsers.clear();
        const sortedIds = [myProfile.id, user.id].sort();
        currentSecretKey = sortedIds[0] + "_" + sortedIds[1];

        const chatBox = document.getElementById("chatMessages");
        chatBox.innerHTML = `<div id="loading-spinner" class="text-center text-themeSub text-xs py-10"><i class="fa-solid fa-spinner fa-spin text-xl mb-2"></i><br>Đang đồng bộ tin nhắn...</div>`;

        const chatInfo = document.getElementById("currentChatInfo"); if (chatInfo) chatInfo.classList.remove("hidden");
        const targetName = document.getElementById("chatTargetName");
        if (targetName) { targetName.innerHTML = `<div class="flex items-center gap-2">${getSafeAvatar(user.avatarUrl, user.username, "w-6 h-6", "text-[10px]")}<span>${user.username}</span></div>`; }

        const placeholder = document.getElementById("chatPlaceholder"); if (placeholder) placeholder.style.display = "none";
        document.getElementById("messageInput").disabled = false; document.getElementById("btnSend").disabled = false;

        if (connection && connection.state === "Connected") {
            connection.invoke("LoadPrivateHistory", user.id).catch(err => { console.error("Lỗi Backend SignalR:", err); });
            clearTimeout(loadHistoryTimeout);
            loadHistoryTimeout = setTimeout(() => {
                if (document.getElementById("loading-spinner")) {
                    chatBox.innerHTML = `<div class="text-center text-themeSub text-xs py-10 italic">Chưa có tin nhắn nào. Hãy là người đầu tiên bắt chuyện!</div>`;
                }
            }, 1500);
        } else {
            chatBox.innerHTML = `<div class="text-center text-red-500 py-10 italic">Đang kết nối lại máy chủ... Hãy F5 nếu đợi quá lâu.</div>`;
        }
    } catch (error) { console.error("Lỗi Javascript nội bộ:", error); }
}

function decryptMessage(encryptedText) {
    if (!currentSecretKey) return "🔒";
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedText, currentSecretKey);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return originalText || "🔒 Lỗi giải mã";
    } catch (e) { return "🔒 Lỗi mã hóa"; }
}
// BẢN NÂNG CẤP CUỐI CÙNG: CÓ BONG BÓNG CHAT, ẢNH MEDIA VÀ THÔNG BÁO HỆ THỐNG [SYS]
// BẢN NÂNG CẤP CUỐI CÙNG: CÓ BONG BÓNG CHAT, ẢNH MEDIA, THÔNG BÁO HỆ THỐNG VÀ LỊCH SỬ CUỘC GỌI
// BẢN NÂNG CẤP TỐI THƯỢNG: CÓ BONG BÓNG, MEDIA, THÔNG BÁO, CALL LOG VÀ THỜI GIAN/NGÀY THÁNG
function appendMessage(messageId, senderId, senderName, encryptedText, isRead = false, isRecalled = false, createdAt = null) {
    const chatBox = document.getElementById("chatMessages");
    if (!chatBox) return;

    if (document.getElementById("loading-spinner") || chatBox.innerHTML.includes("Chưa có tin nhắn nào")) {
        chatBox.innerHTML = "";
        lastMessageDate = null;
    }

    const existingIndicator = document.getElementById("typingIndicator"); if (existingIndicator) existingIndicator.remove();
    const oldSeen = document.getElementById("seenStatus"); if (oldSeen) oldSeen.remove();

    const decryptedText = decryptMessage(encryptedText);
    const isMe = (senderId === myProfile.id);

    const msgDateObj = createdAt ? new Date(createdAt) : new Date();
    const timeString = msgDateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const dateString = msgDateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const todayStr = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    if (lastMessageDate !== dateString) {
        const dateDiv = document.createElement("div");
        dateDiv.className = "flex justify-center w-full my-4";
        const displayDate = (dateString === todayStr) ? "Hôm nay" : dateString;
        dateDiv.innerHTML = `<span class="bg-themeBg border border-themeBorder text-themeSub text-[10px] font-bold px-3 py-1 rounded-full shadow-sm">${displayDate}</span>`;
        chatBox.appendChild(dateDiv);
        lastMessageDate = dateString;
    }

    if (decryptedText.startsWith("[SYS]")) {
        const sysContent = decryptedText.replace("[SYS]", "");
        const sysDiv = document.createElement("div");
        sysDiv.id = `msg-${messageId}`;
        sysDiv.className = `flex flex-col w-full items-center my-2`;
        sysDiv.innerHTML = `<div class="bg-themeBg/50 text-themeSub text-[11px] font-bold px-4 py-1.5 rounded-full border border-themeBorder shadow-sm">${sysContent}</div>`;
        chatBox.appendChild(sysDiv); chatBox.scrollTop = chatBox.scrollHeight; return;
    }

    if (decryptedText.startsWith("[CALL|")) {
        const parts = decryptedText.split("|");
        const callType = parts[1];
        const duration = parseInt(parts[2].replace("]", ""));
        const isMissed = duration === 0;
        const callIcon = callType === "VIDEO" ? "fa-video" : "fa-phone";

        let statusText = isMissed ? "Cuộc gọi nhỡ" : `Cuộc gọi ${callType === 'VIDEO' ? 'Video' : 'thoại'}`;
        let durationText = isMissed ? "Không trả lời" : (duration > 60 ? `${Math.floor(duration / 60)} phút ${duration % 60} giây` : `${duration} giây`);

        let iconBgClass = "bg-gray-100 dark:bg-gray-700 text-gray-500";
        if (isMissed && !isMe) iconBgClass = "bg-red-100 text-red-500";
        else if (isMissed && isMe) iconBgClass = "bg-gray-100 text-red-500";
        else iconBgClass = "bg-green-100 text-green-600";

        const msgDiv = document.createElement("div");
        msgDiv.id = `msg-${messageId}`;
        msgDiv.className = `flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? 'self-end items-end' : 'self-start items-start'} mb-2 group`;

        msgDiv.innerHTML = `
            <div class="px-4 py-3 shadow-sm flex items-center gap-4 bg-themeBg border border-themeBorder" style="border-radius: ${isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};">
                <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconBgClass}"><i class="fa-solid ${callIcon} text-lg"></i></div>
                <div class="flex flex-col">
                    <span class="font-bold text-sm text-themeText">${statusText}</span>
                    <span class="text-xs text-themeSub">${durationText} <span class="mx-1">•</span> ${timeString}</span>
                </div>
                <button onclick="startCall(${callType === 'VIDEO'})" class="ml-2 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition" title="Gọi lại"><i class="fa-solid fa-phone text-xs"></i></button>
            </div>
        `;
        chatBox.appendChild(msgDiv); chatBox.scrollTop = chatBox.scrollHeight; return;
    }

    let actualText = decryptedText;
    let replyHtml = "";

    // BÓC TÁCH PHẦN TRẢ LỜI TIN NHẮN (NẾU CÓ)
    if (actualText.startsWith("[REPLY|")) {
        const firstBracketClose = actualText.indexOf("]");
        if (firstBracketClose !== -1) {
            const replyData = actualText.substring(7, firstBracketClose).split("|");
            const replyName = replyData[0] || "Ai đó";
            const replySnippet = replyData[1] || "...";
            actualText = actualText.substring(firstBracketClose + 1);

            replyHtml = `
                <div class="mb-1.5 px-2 py-1 bg-black/10 dark:bg-white/10 rounded border-l-4 border-primary text-[11px] opacity-90 line-clamp-2 italic cursor-pointer">
                    <div class="font-bold mb-0.5">${replyName}</div>
                    ${replySnippet}
                </div>
            `;
        }
    }

    const msgDiv = document.createElement("div");
    msgDiv.id = `msg-${messageId}`;
    msgDiv.className = `flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? 'self-end items-end' : 'self-start items-start'} mb-2 group/menu`;

    const nameLabel = (!isMe && currentChatTarget && currentChatTarget.isGroup) ? `<span class="text-[11px] text-themeSub mb-1 ml-1 font-bold">${senderName}</span>` : '';
    const bubbleStyle = isMe ? `background-color: var(--chat-me); color: white; border-radius: 18px 18px 4px 18px;` : `background-color: var(--chat-other); color: var(--chat-text-other); border-radius: 18px 18px 18px 4px;`;

    if (isRecalled) {
        msgDiv.innerHTML = `
            ${nameLabel}
            <div class="px-4 py-2 shadow-sm italic opacity-70 bg-transparent border border-themeBorder text-themeSub text-sm flex flex-col" style="border-radius: 18px;">
                <span><i class="fa-solid fa-rotate-left mr-1"></i> Tin nhắn đã bị thu hồi</span>
                <span class="text-[9px] opacity-70 text-right mt-1 -mb-1 self-end">${timeString}</span>
            </div>
        `;
    } else {
        let contentHtml = "";
        let snippetForReply = "Hình ảnh/Video";

        if (actualText.startsWith("[MEDIA|")) {
            const parts = actualText.split("]");
            const mediaType = parts[0].replace("[MEDIA|", "");
            const fileEncUrl = BASE_URL + parts[1];

            contentHtml = `<div id="media-box-${messageId}" class="w-48 h-48 bg-black/10 flex flex-col items-center justify-center text-themeSub cursor-wait" style="${bubbleStyle} border-bottom-right-radius: ${isMe ? '4px' : '18px'};"><i class="fa-solid fa-lock text-3xl mb-2"></i><div class="text-xs text-center px-2">Đang giải mã...</div></div>`;

            fetch(fileEncUrl).then(r => r.text()).then(encryptedBase64Text => {
                const decryptedBase64 = CryptoJS.AES.decrypt(encryptedBase64Text, currentSecretKey).toString(CryptoJS.enc.Utf8);
                const mediaBox = document.getElementById(`media-box-${messageId}`);
                if (mediaBox) {
                    if (mediaType === 'VIDEO') mediaBox.outerHTML = `<video src="${decryptedBase64}" controls class="max-w-full max-h-[300px] shadow-sm bg-black" style="border-radius: 14px;"></video>`;
                    else mediaBox.outerHTML = `<img src="${decryptedBase64}" onclick="window.open(this.src, '_blank')" class="max-w-full max-h-[300px] shadow-sm cursor-pointer hover:opacity-90 transition object-cover" style="border-radius: 14px;">`;
                }
            }).catch(e => console.error("Lỗi giải mã:", e));
        } else {
            contentHtml = typeof formatMentions === "function" ? formatMentions(actualText) : actualText;
            snippetForReply = actualText.substring(0, 30).replace(/'/g, "\\'") + (actualText.length > 30 ? "..." : "");
        }

        // TẠO MENU 3 NÚT HIỆN RA KHI HOVER
        const btnReply = `<button onclick="replyToMessage('${messageId}', '${isMe ? myProfile.username : senderName}', '${snippetForReply}')" class="text-themeSub hover:text-primary transition p-1.5" title="Trả lời"><i class="fa-solid fa-reply"></i></button>`;
        const btnDeleteMe = `<button onclick="deleteForMe('${messageId}')" class="text-themeSub hover:text-orange-500 transition p-1.5" title="Xóa ở phía tôi"><i class="fa-solid fa-trash-can"></i></button>`;
        const btnRecall = isMe ? `<button onclick="recallMessage('${messageId}')" class="text-themeSub hover:text-red-500 transition p-1.5" title="Thu hồi (2 phía)"><i class="fa-solid fa-rotate-left"></i></button>` : '';

        const optionsMenu = `
            <div class="absolute ${isMe ? 'right-full mr-2' : 'left-full ml-2'} top-1/2 -translate-y-1/2 flex items-center bg-themePanel border border-themeBorder shadow-md rounded-full px-1 opacity-0 group-hover/menu:opacity-100 transition-opacity duration-200 z-10 w-max">
                ${btnReply}
                ${btnDeleteMe}
                ${btnRecall}
            </div>
        `;

        msgDiv.innerHTML = `
            ${nameLabel}
            <div class="relative flex items-center w-fit max-w-full">
                ${isMe ? optionsMenu : ''}
                <div class="px-3 py-1.5 shadow-sm break-words text-[15px] leading-relaxed relative flex flex-col min-w-[70px] w-fit" style="${bubbleStyle}">
                    ${replyHtml}
                    <span class="whitespace-pre-wrap">${contentHtml}</span>
                    <span class="text-[9px] opacity-70 text-right mt-0.5 -mb-0.5 ml-2 self-end">${timeString}</span>
                </div>
                ${!isMe ? optionsMenu : ''}
            </div>
        `;

        if (isMe && isRead) msgDiv.innerHTML += `<div id="seenStatus" class="text-[10px] text-themeSub text-right mt-1 px-1"><i class="fa-solid fa-circle-check text-green-500"></i> Đã xem</div>`;
    }

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// GỌI API THU HỒI
function recallMessage(messageId) {
    if (!currentChatTarget || !connection || connection.state !== "Connected") return;
    if (confirm("Thu hồi tin nhắn này ở cả hai phía?")) {
        connection.invoke("RecallMessage", currentChatTarget.id, messageId).catch(console.error);
    }
}

async function initSignalR(token) {
    // 1. KHỞI TẠO BIẾN CONNECTION TRƯỚC TIÊN
    connection = new signalR.HubConnectionBuilder()
        .withUrl(`${BASE_URL}/chathub`, { accessTokenFactory: () => token })
        .withAutomaticReconnect().build();

    // 2. ĐĂNG KÝ CÁC SỰ KIỆN LẮNG NGHE (CONNECTION.ON) NẰM Ở ĐÂY
    connection.on("LoadHistory", function(history) {
        clearTimeout(loadHistoryTimeout);
        const chatBox = document.getElementById("chatMessages");
        if (chatBox) {
            chatBox.innerHTML = "";
            lastMessageDate = null; // BẮT BUỘC RESET NGÀY KHI MỞ CHAT MỚI
        }

        if (!history || history.length === 0) {
            if (chatBox) chatBox.innerHTML = `<div class="text-center text-themeSub text-xs py-10 italic">Chưa có tin nhắn nào. Hãy bắt chuyện!</div>`;
            return;
        }

        // Thêm trường msg.createdAt vào cuối hàm gọi appendMessage
        history.forEach(msg => {
            appendMessage(msg.id || msg.Id, msg.senderId || msg.SenderId, msg.senderUsername || msg.SenderUsername, msg.content || msg.Content, msg.isRead || msg.IsRead, msg.isRecalled || msg.IsRecalled, msg.createdAt || msg.CreatedAt);
        });

        if (currentChatTarget && connection.state === "Connected") {
            connection.invoke("MarkAsRead", currentChatTarget.id).catch(console.error);
        }
    });

    // MẮT THẦN: LẮNG NGHE NHIỀU NGƯỜI GÕ PHÍM TRONG NHÓM
    connection.on("ReceiveGroupTypingState", function(groupId, userId, username, isUserTyping) {
        if (currentChatTarget && currentChatTarget.isGroup && currentChatTarget.id === groupId && userId !== myProfile.id) {
            const chatBox = document.getElementById("chatMessages");
            let existingIndicator = document.getElementById("typingIndicator");

            if (isUserTyping) groupTypingUsers.add(username);
            else groupTypingUsers.delete(username);

            if (groupTypingUsers.size > 0) {
                if (!existingIndicator && chatBox) {
                    existingIndicator = document.createElement("div");
                    existingIndicator.id = "typingIndicator";
                    existingIndicator.className = "self-start text-[11px] text-themeSub italic mt-1 px-2 animate-pulse";
                    chatBox.appendChild(existingIndicator);
                }
                const names = Array.from(groupTypingUsers).join(", ");
                existingIndicator.innerHTML = `${names} đang nhập phím...`;
                chatBox.scrollTop = chatBox.scrollHeight;
            } else {
                if (existingIndicator) existingIndicator.remove();
            }
        }
    });

    connection.on("ReceiveMessage", function(messageId, userId, user, encryptedMessage, isRecalled) {
        if (currentChatTarget && (userId === currentChatTarget.id || userId === myProfile.id)) {
            // Nếu đang chat với đúng người đó -> Vẽ tin nhắn ra
            appendMessage(messageId, userId, user, encryptedMessage, false, isRecalled);
            if (userId === currentChatTarget.id && connection.state === "Connected") {
                connection.invoke("MarkAsRead", currentChatTarget.id).catch(console.error);
            }
        } else {
            // Nếu đang lướt chỗ khác hoặc chat với người khác -> Kêu Ting Ting và hiện Toast
            document.getElementById("sound-msg")?.play().catch(() => { });

            // Hàm showToast (nếu cậu đã viết ở global.js) hoặc dùng alert tạm
            if (typeof showToast === 'function') {
                showToast(`Tin nhắn mới từ ${user}`, 'info', () => {
                    window.location.href = `chat.html?targetId=${userId}`;
                });
            } else {
                // Tạm thời nếu chưa có UI Toast xịn
                const wantToChat = confirm(`Bạn có tin nhắn mới từ ${user}. Chuyển đến chat ngay?`);
                if (wantToChat) window.location.href = `chat.html?targetId=${userId}`;
            }
        }
    });

    connection.on("ReceiveGroupMessage", function(groupId, messageId, senderId, senderName, encryptedMessage, isRecalled) {
        if (currentChatTarget && currentChatTarget.isGroup && currentChatTarget.id === groupId) {
            appendMessage(messageId, senderId, senderName, encryptedMessage, false, isRecalled);
        }
    });

    connection.on("ReceiveMessageRecalled", function (messageId) {
        const msgDiv = document.getElementById(`msg-${messageId}`);
        if (msgDiv) {
            // Lấy lại cái tên (nếu là chat nhóm) để không bị mất tên khi thu hồi
            const nameLabel = msgDiv.querySelector('.text-\\[11px\\]') ? msgDiv.querySelector('.text-\\[11px\\]').outerHTML : '';

            // Xóa sạch nội dung cũ, vẽ lại cái khung thu hồi chuẩn Zalo
            msgDiv.innerHTML = `
                ${nameLabel}
                <div class="px-4 py-2 shadow-sm italic opacity-70 bg-transparent border border-themeBorder text-themeSub text-sm flex flex-col" style="border-radius: 18px;">
                    <span><i class="fa-solid fa-rotate-left mr-1"></i> Tin nhắn đã bị thu hồi</span>
                </div>
            `;
        }
    });

    connection.on("ReceiveTypingState", function(userId, isUserTyping) {
        if (currentChatTarget && userId === currentChatTarget.id) {
            const chatBox = document.getElementById("chatMessages");
            const existingIndicator = document.getElementById("typingIndicator");

            if (isUserTyping) {
                if (!existingIndicator && chatBox) {
                    const typingDiv = document.createElement("div"); typingDiv.id = "typingIndicator";
                    typingDiv.className = "self-start text-[11px] text-themeSub italic mt-1 px-2 animate-pulse";
                    typingDiv.innerHTML = `${currentChatTarget.username} đang nhập phím...`;
                    chatBox.appendChild(typingDiv); chatBox.scrollTop = chatBox.scrollHeight;
                }
            } else { if (existingIndicator) existingIndicator.remove(); }
        }
    });
    connection.on("MessageDeletedForMe", function (messageId) {
        const msgDiv = document.getElementById(`msg-${messageId}`);
        if (msgDiv) msgDiv.remove();
    });
    connection.on("ReceiveReadReceipt", function(readerId) {
        if (currentChatTarget && readerId === currentChatTarget.id) {
            const chatBox = document.getElementById("chatMessages");
            const oldSeen = document.getElementById("seenStatus"); if (oldSeen) oldSeen.remove();

            const myMessages = chatBox.querySelectorAll('.self-end');
            if (myMessages.length > 0) {
                const lastMyMsg = myMessages[myMessages.length - 1];
                lastMyMsg.insertAdjacentHTML('beforeend', `<div id="seenStatus" class="text-[10px] text-themeSub text-right mt-1 px-1"><i class="fa-solid fa-circle-check text-green-500"></i> Đã xem</div>`);
                chatBox.scrollTop = chatBox.scrollHeight;
            }
        }
    });

    // Bắt lỗi Cấm chat từ Server gửi về
    connection.on("ReceiveError", function (errMsg) {
        alert(errMsg);
    });
    // MẮT THẦN WEBRTC
    connection.on("ReceiveCall", function(callerId, callerName, isVideo) {
        showIncomingCallUI(callerId, callerName, isVideo);
    });

    connection.on("CallAccepted", async function(calleeId) {
        await handleCallAccepted(calleeId);
    });

    connection.on("CallRejected", function(calleeId) {
        alert("Người dùng đang bận hoặc đã từ chối cuộc gọi.");
        generateCallLog(); // <-- CHÈN THÊM VÀO ĐÂY NÈ
        resetCallUI();
    });

    connection.on("CallEnded", function(userId) {
        generateCallLog(); // <-- VÀ CHÈN THÊM VÀO ĐÂY NỮA
        resetCallUI();
    });

    connection.on("ReceiveWebRTCData", async function(senderId, type, payload) {
        await processWebRTCData(senderId, type, payload);
    });

    // 3. START KẾT NỐI Ở CUỐI CÙNG
    try {
        await connection.start();
        // Tự động Join vào các nhóm đang tham gia để nhận thông báo nhóm realtime
        const resGroups = await fetch(`${BASE_URL}/api/group/my-groups`, { headers: { "Authorization": "Bearer " + localStorage.getItem("jwtToken") } });
        if (resGroups.ok) {
            const groups = await resGroups.json();
            groups.forEach(g => {
                connection.invoke("JoinGroup", g.id).catch(console.error);
            });
        }
    } catch (err) { console.error("Lỗi kết nối SignalR:", err); }
}

function sendMessage() {
    if (!currentChatTarget) return;
    const input = document.getElementById("messageInput");
    const message = input.value;
    if (!message.trim()) return;

    // Bọc thẻ REPLY nếu đang trong chế độ Trả lời tin nhắn
    let finalMessage = message;
    if (currentReplyToMessage) {
        finalMessage = `[REPLY|${currentReplyToMessage.name}|${currentReplyToMessage.text}]${message}`;
        cancelReply(); // Gửi xong thì tắt hộp thoại trả lời
    }

    // Mã hóa E2EE bằng key nhóm hoặc key cá nhân
    const encryptedMessage = CryptoJS.AES.encrypt(finalMessage, currentSecretKey).toString();

    if (connection && connection.state === "Connected") {
        if (currentChatTarget.isGroup) {
            // Gửi vào Nhóm
            connection.invoke("SendGroupMessage", currentChatTarget.id, encryptedMessage).catch(err => console.error(err));
        } else {
            // Gửi 1-1
            connection.invoke("SendPrivateMessage", currentChatTarget.id, encryptedMessage).catch(err => console.error(err));
        }
    }
    input.value = "";
    input.focus();

    if (connection && connection.state === "Connected") {
        clearTimeout(typingTimeout); isTyping = false;
        if (currentChatTarget.isGroup) connection.invoke("SendGroupTypingState", currentChatTarget.id, false).catch(console.error);
        else connection.invoke("SendTypingState", currentChatTarget.id, false).catch(console.error);
    }
}

async function handleE2EEMediaUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentChatTarget || connection.state !== "Connected") return;

    // Giới hạn 100MB
    if (file.size > 100 * 1024 * 1024) {
        alert("File quá lớn! Vui lòng chọn file dưới 100MB.");
        event.target.value = ""; return;
    }

    // Hiển thị loading giả lập
    const chatBox = document.getElementById("chatMessages");
    const tempId = "uploading-" + Date.now();
    chatBox.insertAdjacentHTML('beforeend', `<div id="${tempId}" class="flex mb-3 justify-end"><div class="bg-primary/50 text-white rounded-2xl px-4 py-2 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang mã hóa E2EE (${(file.size / 1024 / 1024).toFixed(1)}MB)...</div></div>`);
    chatBox.scrollTop = chatBox.scrollHeight;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const base64Data = e.target.result;
            const isVideo = file.type.startsWith("video/");

            // 1. MÃ HÓA CỤC BASE64 BẰNG CRYPTOJS
            const encryptedBase64 = CryptoJS.AES.encrypt(base64Data, currentSecretKey).toString();

            // 2. ĐẨY FILE MÃ HÓA LÊN SERVER
            const token = localStorage.getItem("jwtToken");
            const res = await fetch(`${BASE_URL_GLOBAL}/api/upload/chat-e2ee`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ EncryptedContent: encryptedBase64 })
            });

            if (res.ok) {
                const data = await res.json();
                // 3. BẮN LINK QUA SIGNALR, CẮM CỜ [MEDIA]
                const finalSignalRMessage = `[MEDIA|${isVideo ? 'VIDEO' : 'IMAGE'}]${data.fileUrl}`;
                const encryptedSignalRMessage = CryptoJS.AES.encrypt(finalSignalRMessage, currentSecretKey).toString();
                await connection.invoke("SendPrivateMessage", currentChatTarget.id, encryptedSignalRMessage);
            }
        } catch (error) {
            console.error("Lỗi gửi file:", error); alert("Lỗi khi xử lý file!");
        } finally {
            document.getElementById(tempId)?.remove();
            event.target.value = "";
        }
    };
    reader.readAsDataURL(file);
}


function toggleChatInfo() {
    const panel = document.getElementById("chatRightPanel");
    if (panel.classList.contains("translate-x-full")) {
        panel.classList.remove("translate-x-full", "hidden");
        loadFullChatData();
    } else {
        panel.classList.add("translate-x-full");
        setTimeout(() => panel.classList.add("hidden"), 300);
    }
}

async function loadFullChatData() {
    if (!currentChatTarget) return;
    const gallery = document.getElementById("chatMediaGallery");
    gallery.innerHTML = `<div class="text-xs text-themeSub col-span-3"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải và giải mã...</div>`;

    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/user/chat-data/${currentChatTarget.id}`, { headers: { "Authorization": "Bearer " + token } });
        if (res.ok) {
            const encryptedMessages = await res.json();
            fullDecryptedHistory = [];
            let galleryHtml = "";

            // Giải mã toàn bộ lịch sử trong RAM
            encryptedMessages.forEach(msg => {
                let decrypted = "";
                try { decrypted = CryptoJS.AES.decrypt(msg.content, currentSecretKey).toString(CryptoJS.enc.Utf8); } catch (e) { return; }

                fullDecryptedHistory.push({
                    id: msg.id,
                    senderId: msg.senderId,
                    text: decrypted,
                    createdAt: new Date(msg.createdAt).toLocaleString('vi-VN')
                });

                // Nếu phát hiện là file Media, tiến hành tải file .enc và tạo Thumbnail
                if (decrypted.startsWith("[MEDIA|")) {
                    const parts = decrypted.split("]");
                    const mediaType = parts[0].replace("[MEDIA|", "");
                    const fileEncUrl = BASE_URL + parts[1];
                    const thumbId = "thumb-" + msg.id;

                    galleryHtml += `
                        <div class="aspect-square bg-themeBg border border-themeBorder rounded cursor-pointer overflow-hidden relative group" onclick="scrollToMessage('${msg.id}')">
                            <div id="${thumbId}" class="w-full h-full flex items-center justify-center text-themeSub text-xs"><i class="fa-solid fa-spinner fa-spin"></i></div>
                        </div>
                    `;

                    // Tải ngầm file để render thumbnail
                    fetch(fileEncUrl).then(r => r.text()).then(encBase64 => {
                        const decBase64 = CryptoJS.AES.decrypt(encBase64, currentSecretKey).toString(CryptoJS.enc.Utf8);
                        const thumbDiv = document.getElementById(thumbId);
                        if (thumbDiv) {
                            if (mediaType === 'VIDEO') {
                                thumbDiv.outerHTML = `<video src="${decBase64}" class="w-full h-full object-cover"></video><div class="absolute inset-0 bg-black/30 flex items-center justify-center"><i class="fa-solid fa-play text-white opacity-80 group-hover:scale-125 transition"></i></div>`;
                            } else {
                                thumbDiv.outerHTML = `<img src="${decBase64}" class="w-full h-full object-cover group-hover:scale-110 transition">`;
                            }
                        }
                    }).catch(e => { });
                }
            });

            if (!galleryHtml) galleryHtml = `<div class="text-xs text-themeSub col-span-3 italic">Chưa có ảnh/video nào.</div>`;
            gallery.innerHTML = galleryHtml;
        }
    } catch (e) { console.error("Lỗi lấy lịch sử:", e); }
}

function searchLocalMessages(keyword) {
    const resultContainer = document.getElementById("localSearchResults");
    if (!keyword.trim()) { resultContainer.classList.add("hidden"); return; }

    resultContainer.classList.remove("hidden");
    const lowerKeyword = keyword.toLowerCase();

    // Lọc các tin nhắn TEXT (không phải media) chứa từ khóa
    const results = fullDecryptedHistory.filter(m => !m.text.startsWith("[MEDIA|") && m.text.toLowerCase().includes(lowerKeyword));

    if (results.length === 0) {
        resultContainer.innerHTML = `<div class="text-xs text-themeSub italic p-3 bg-themeBg rounded-lg">Không tìm thấy tin nhắn nào khớp.</div>`;
        return;
    }

    resultContainer.innerHTML = results.map(m => `
        <div class="p-3 bg-themeBg hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition border border-themeBorder" onclick="scrollToMessage('${m.id}')">
            <div class="text-[10px] text-themeSub mb-1 font-bold">${m.senderId === myProfile.id ? 'Bạn' : currentChatTarget.username} <span class="font-normal opacity-70">(${m.createdAt})</span></div>
            <div class="text-sm text-themeText line-clamp-2 leading-tight">${m.text.replace(new RegExp(keyword, 'gi'), match => `<mark class="bg-yellow-300 text-black px-1 rounded font-bold">${match}</mark>`)}</div>
        </div>
    `).join("");
}

function scrollToMessage(msgId) {
    const msgElem = document.getElementById(`msg-${msgId}`);
    if (msgElem) {
        msgElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Chớp nháy màu vàng để báo hiệu tin nhắn đang tìm
        const chatBubble = msgElem.querySelector('.whitespace-pre-wrap');
        if (chatBubble) {
            const oldBg = chatBubble.style.backgroundColor;
            chatBubble.style.backgroundColor = '#fef08a'; // Vàng nhạt
            chatBubble.style.color = '#000';
            setTimeout(() => {
                chatBubble.style.backgroundColor = oldBg;
                chatBubble.style.color = '';
            }, 2000);
        }
    } else {
        alert("Tin nhắn này ở quá xa trong lịch sử. Hãy cuộn màn hình lên để tải thêm tin nhắn cũ trước nhé!");
    }
}

// ==========================================
// THAO TÁC TẠO NHÓM CHAT (MODAL)
// ==========================================
function openCreateGroupModal() {
    document.getElementById("createGroupModal")?.classList.remove("hidden");
    document.getElementById("groupNameInput")?.focus();
}

function closeCreateGroupModal() {
    document.getElementById("createGroupModal")?.classList.add("hidden");
    const input = document.getElementById("groupNameInput");
    if (input) input.value = "";
}

async function submitCreateGroup() {
    const input = document.getElementById("groupNameInput");
    const name = input ? input.value.trim() : "";
    if (!name) { alert("Vui lòng nhập tên nhóm!"); return; }

    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/group/create`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ name: name })
        });

        if (res.ok) {
            const data = await res.json();
            closeCreateGroupModal();
            alert("Tạo nhóm thành công!");

            // Reload danh sách chat & Tự động mở Nhóm mới vừa tạo
            await loadFriendList(token);
            startGroupChatWith({ id: data.groupId, name: data.groupName, avatarUrl: '', isGroup: true });
        } else {
            const errText = await res.text();
            alert("Lỗi: " + errText);
        }
    } catch (e) {
        console.error("Lỗi tạo nhóm:", e);
        alert("Lỗi kết nối máy chủ!");
    }
}
// HỆ THỐNG QUẢN LÝ THÀNH VIÊN NHÓM CHAT
const originalToggleChatInfo = toggleChatInfo;
toggleChatInfo = function () {
    originalToggleChatInfo(); // Gọi lại hàm cũ (mở panel, load chat data)

    // Nếu đang mở Nhóm, thì hiển thị thêm phần Thành viên
    const panel = document.getElementById("chatRightPanel");
    if (!panel.classList.contains("hidden")) {
        const groupSec = document.getElementById("groupMembersSection");
        if (currentChatTarget && currentChatTarget.isGroup) {
            groupSec.classList.remove("hidden");
            loadGroupMembers();
        } else {
            groupSec.classList.add("hidden");
        }
    }
};

async function loadGroupMembers() {
    if (!currentChatTarget || !currentChatTarget.isGroup) return;
    const token = localStorage.getItem("jwtToken");
    const container = document.getElementById("groupMembersList");

    try {
        const res = await fetch(`${BASE_URL}/api/group/${currentChatTarget.id}/members`, { headers: { "Authorization": "Bearer " + token } });
        if (res.ok) {
            const members = await res.json();
            container.innerHTML = "";
            const myRole = members.find(m => m.id === myProfile.id)?.role || 0;

            members.forEach(m => {
                let roleBadge = m.role === 2 ? `<span class="bg-red-100 text-red-600 text-[9px] px-1.5 py-0.5 rounded font-bold">Trưởng nhóm</span>` :
                    m.role === 1 ? `<span class="bg-orange-100 text-orange-600 text-[9px] px-1.5 py-0.5 rounded font-bold">Phó nhóm</span>` : "";

                let mutedBadge = m.isMuted ? `<i class="fa-solid fa-microphone-lines-slash text-red-500 text-[10px]" title="Bị cấm chat"></i>` : "";

                let actions = `<button onclick="window.location.href='profile.html?id=${m.id}'" class="text-themeSub hover:text-primary p-1" title="Xem trang cá nhân"><i class="fa-solid fa-eye"></i></button>`;

                // Nếu mình là Trưởng/Phó và người kia thấp hơn mình
                if (myRole >= 1 && m.id !== myProfile.id && myRole > m.role) {
                    actions += `<button onclick="groupAction('mute', '${m.id}', '${m.username}', ${m.isMuted})" class="text-themeSub hover:text-orange-500 p-1" title="${m.isMuted ? 'Mở chat' : 'Cấm chat'}"><i class="fa-solid ${m.isMuted ? 'fa-microphone' : 'fa-microphone-slash'}"></i></button>`;
                    actions += `<button onclick="groupAction('kick', '${m.id}', '${m.username}')" class="text-themeSub hover:text-red-500 p-1" title="Kích khỏi nhóm"><i class="fa-solid fa-user-minus"></i></button>`;
                }

                // Nếu mình là Trưởng nhóm tuyệt đối
                if (myRole === 2 && m.id !== myProfile.id) {
                    // Nút Vương miện vàng (Truyền ngôi)
                    actions += `<button onclick="groupAction('transfer', '${m.id}', '${m.username}')" class="text-themeSub hover:text-yellow-500 p-1" title="Nhường chức Trưởng nhóm"><i class="fa-solid fa-crown"></i></button>`;
                    // Nút thăng/giáng Phó nhóm
                    actions += `<button onclick="groupAction('role', '${m.id}', '${m.username}', ${m.role === 1 ? 0 : 1})" class="text-themeSub hover:text-blue-500 p-1" title="${m.role === 1 ? 'Giáng chức' : 'Thăng phó nhóm'}"><i class="fa-solid ${m.role === 1 ? 'fa-arrow-down' : 'fa-arrow-up'}"></i></button>`;
                }

                container.innerHTML += `
                    <div class="flex items-center gap-2 p-2 bg-themeBg border border-themeBorder rounded-lg group">
                        ${getSafeAvatar(m.avatarUrl, m.username, "w-7 h-7", "text-[10px]")}
                        <div class="flex-1 min-w-0 flex flex-col">
                            <span class="text-xs font-bold text-themeText truncate flex items-center gap-1">${m.username} ${mutedBadge}</span>
                            <div class="flex">${roleBadge}</div>
                        </div>
                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition bg-themeBg pl-2">${actions}</div>
                    </div>`;
            });

            // TÁCH BIỆT NÚT DÀNH CHO TRƯỞNG NHÓM & THÀNH VIÊN
            if (myRole === 2) {
                container.innerHTML += `<button onclick="groupAction('disband', '${myProfile.id}', '${myProfile.username}')" class="w-full mt-4 py-2 text-white bg-red-500 hover:bg-red-600 text-xs font-bold rounded-lg transition shadow-sm"><i class="fa-solid fa-bomb mr-1"></i> Giải tán nhóm</button>`;
            } else {
                container.innerHTML += `<button onclick="groupAction('leave', '${myProfile.id}', '${myProfile.username}')" class="w-full mt-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-bold rounded-lg transition border border-red-200 dark:border-red-800"><i class="fa-solid fa-right-from-bracket mr-1"></i> Rời khỏi nhóm</button>`;
            }
        }
    } catch (e) { console.error(e); }
}

async function groupAction(type, targetId, username, extraParam = null) {
    if (!currentChatTarget) return;
    const token = localStorage.getItem("jwtToken");

    try {
        if (type === 'kick') {
            if (!confirm(`Đuổi ${username} khỏi nhóm?`)) return;
            await fetch(`${BASE_URL}/api/group/${currentChatTarget.id}/kick/${targetId}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
            sendSystemMessage(`${myProfile.username} đã kích ${username} khỏi nhóm.`);
        }
        else if (type === 'mute') {
            await fetch(`${BASE_URL}/api/group/${currentChatTarget.id}/mute/${targetId}`, { method: "PUT", headers: { "Authorization": "Bearer " + token } });
            sendSystemMessage(`${myProfile.username} đã ${extraParam ? 'mở' : 'cấm'} chat đối với ${username}.`);
        }
        else if (type === 'role') {
            await fetch(`${BASE_URL}/api/group/${currentChatTarget.id}/role/${targetId}?newRole=${extraParam}`, { method: "PUT", headers: { "Authorization": "Bearer " + token } });
            sendSystemMessage(`${myProfile.username} đã ${extraParam === 1 ? 'thăng chức Phó nhóm cho' : 'giáng chức'} ${username}.`);
        }
        else if (type === 'transfer') {
            if (!confirm(`Chắc chắn muốn nhường chức Trưởng nhóm cho ${username}? Bạn sẽ bị giáng xuống làm Phó nhóm.`)) return;
            await fetch(`${BASE_URL}/api/group/${currentChatTarget.id}/transfer/${targetId}`, { method: "PUT", headers: { "Authorization": "Bearer " + token } });
            sendSystemMessage(`${myProfile.username} đã truyền ngôi Trưởng nhóm cho ${username}.`);
        }
        else if (type === 'disband') {
            if (!confirm("CẢNH BÁO MỨC ĐỘ ĐỎ: Hành động này sẽ nổ tung nhóm và xóa sạch toàn bộ tin nhắn vĩnh viễn. Bạn chắc chắn chứ?")) return;
            await fetch(`${BASE_URL}/api/group/${currentChatTarget.id}/disband`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
            alert("Đã giải tán nhóm thành công!");
            window.location.reload(); return; // F5 lại trang để xóa mất nhóm ở cột bên trái
        }
        else if (type === 'leave') {
            if (!confirm("Bạn muốn rời khỏi nhóm này?")) return;
            const res = await fetch(`${BASE_URL}/api/group/${currentChatTarget.id}/leave`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
            if (res.ok) {
                sendSystemMessage(`${myProfile.username} đã rời khỏi nhóm.`);
                window.location.reload(); return;
            } else {
                alert((await res.json()).message); return;
            }
        }
        loadGroupMembers();
    } catch (e) { alert("Lỗi thực thi!"); }
}





async function promptAddMember() {
    if (!currentChatTarget || !currentChatTarget.isGroup) return;
    const email = prompt("Nhập địa chỉ Email người bạn muốn mời:");
    if (!email) return;

    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/group/${currentChatTarget.id}/add-member`, {
            method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify(email)
        });
        const data = await res.json();
        if (res.ok) {
            alert(data.message);
            loadGroupMembers();
            sendSystemMessage(`${myProfile.username} đã thêm ${data.targetName} vào nhóm.`);
        } else alert("Lỗi: " + data.message);
    } catch (e) { alert("Lỗi mạng!"); }
}

function sendSystemMessage(text) {
    if (!currentChatTarget || !currentChatTarget.isGroup || !connection) return;
    const sysMsg = `[SYS]${text}`;
    const encryptedMsg = CryptoJS.AES.encrypt(sysMsg, currentSecretKey).toString();
    connection.invoke("SendGroupMessage", currentChatTarget.id, encryptedMsg).catch(console.error);
}

// ==========================================
// GIAI ĐOẠN 4: CỖ MÁY WEBRTC (VIDEO / AUDIO CALL)
// ==========================================


// Cấu hình STUN Server miễn phí của Google (Giúp tìm IP Public để đục tường lửa)
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};
// 1. NGƯỜI GỌI BẤM NÚT (Gọi đi)
async function startCall(isVideo) {
    if (!currentChatTarget || currentChatTarget.isGroup) return;
    isVideoCallActive = isVideo;
    currentCallTargetId = currentChatTarget.id;
    isCaller = true;       // <-- Đánh dấu là người gọi
    callStartTime = null;  // <-- Đặt lại thời gian

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        document.getElementById("localVideo").srcObject = localStream;

        const overlay = document.getElementById("callOverlay");
        overlay.classList.remove("hidden", "opacity-0");
        document.getElementById("callWaitingScreen").classList.remove("hidden");
        document.getElementById("callActiveScreen").classList.add("hidden");
        document.getElementById("btnAcceptCall").classList.add("hidden");

        document.getElementById("callName").innerText = currentChatTarget.username;
        document.getElementById("callAvatar").src = currentChatTarget.avatarUrl ? (currentChatTarget.avatarUrl.startsWith('http') ? currentChatTarget.avatarUrl : BASE_URL + currentChatTarget.avatarUrl) : "https://via.placeholder.com/150";
        document.getElementById("callStatus").innerText = "Đang kết nối...";

        connection.invoke("CallUser", currentCallTargetId, isVideo).catch(console.error);
    } catch (err) {
        console.error("Lỗi thiết bị:", err);
        alert("Không thể truy cập Camera/Micro. Vui lòng kiểm tra quyền trên trình duyệt!");
        resetCallUI();
    }
    playRingtone();
    // Đặt timeout 45 giây, nếu không ai nghe máy thì tự cúp
    clearTimeout(callTimeoutId);
    callTimeoutId = setTimeout(() => { endCall(); }, 45000);
}

// 2. NGƯỜI NHẬN THẤY CHUÔNG REO
function showIncomingCallUI(callerId, callerName, isVideo) {
    isVideoCallActive = isVideo;
    currentCallTargetId = callerId;
    isCaller = false;      // <-- Đánh dấu là người nghe
    callStartTime = null;  // <-- Đặt lại thời gian

    const overlay = document.getElementById("callOverlay");
    overlay.classList.remove("hidden", "opacity-0");
    document.getElementById("callWaitingScreen").classList.remove("hidden");
    document.getElementById("callActiveScreen").classList.add("hidden");

    document.getElementById("btnAcceptCall").classList.remove("hidden");
    document.getElementById("callName").innerText = callerName;
    document.getElementById("callStatus").innerText = isVideo ? "Cuộc gọi Video đến..." : "Cuộc gọi thoại đến...";
    playRingtone();
    // Đặt timeout 45 giây, nếu không ai nghe máy thì tự cúp
    clearTimeout(callTimeoutId);
    callTimeoutId = setTimeout(() => { endCall(); }, 45000);

}


// 3. NGƯỜI NHẬN BẤM NGHE MÁY
async function acceptCall() {
    stopRingtone();
    clearTimeout(callTimeoutId);
    document.getElementById("floatingCallBadge").classList.add("hidden"); // Ẩn cục nổi đi nếu đang thu nhỏ
    try {
        callStartTime = Date.now(); // <-- Bắt đầu bấm giờ cho người nghe
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideoCallActive, audio: true });
        document.getElementById("localVideo").srcObject = localStream;

        document.getElementById("callWaitingScreen").classList.add("hidden");
        document.getElementById("callActiveScreen").classList.remove("hidden");

        if (!isVideoCallActive) document.getElementById("audioOnlyPlaceholder").classList.remove("hidden");
        else document.getElementById("audioOnlyPlaceholder").classList.add("hidden");

        connection.invoke("AcceptCall", currentCallTargetId).catch(console.error);
    } catch (err) {
        console.error(err);
        alert("Không thể bật thiết bị Camera/Micro để trả lời!");
        endCall();
    }
}

// 4. MÁY GỌI NHẬN TÍN HIỆU ĐỒNG Ý
async function handleCallAccepted(calleeId) {
    stopRingtone();
    clearTimeout(callTimeoutId);
    document.getElementById("floatingCallBadge").classList.add("hidden"); // Ẩn cục nổi đi nếu đang thu nhỏ
    if (currentCallTargetId !== calleeId) return;
    callStartTime = Date.now(); // <-- Bắt đầu bấm giờ cho người gọi

    document.getElementById("callWaitingScreen").classList.add("hidden");
    document.getElementById("callActiveScreen").classList.remove("hidden");

    if (!isVideoCallActive) document.getElementById("audioOnlyPlaceholder").classList.remove("hidden");
    else document.getElementById("audioOnlyPlaceholder").classList.add("hidden");

    createPeerConnection();

    try {
        const offer = await rtcPeerConnection.createOffer();
        await rtcPeerConnection.setLocalDescription(offer);
        connection.invoke("SendWebRTCData", currentCallTargetId, "offer", JSON.stringify(offer));
    } catch (e) { console.error("Lỗi tạo Offer:", e); }
}

// 7. CÚP MÁY VÀ GHI LOG
function endCall() {
    stopRingtone();
    clearTimeout(callTimeoutId);
    document.getElementById("floatingCallBadge").classList.add("hidden"); // Ẩn cục nổi đi nếu đang thu nhỏ
    if (currentCallTargetId && connection.state === "Connected") {
        connection.invoke("EndCall", currentCallTargetId).catch(() => { });

        // TẠO LỊCH SỬ CUỘC GỌI (Chỉ máy người gọi tạo Log để tránh bị lặp tin nhắn)
        if (isCaller) {
            let duration = 0;
            if (callStartTime) {
                duration = Math.floor((Date.now() - callStartTime) / 1000);
            }
            const callType = isVideoCallActive ? "VIDEO" : "AUDIO";
            const callLogStr = `[CALL|${callType}|${duration}]`;

            const encryptedMessage = CryptoJS.AES.encrypt(callLogStr, currentSecretKey).toString();
            connection.invoke("SendPrivateMessage", currentCallTargetId, encryptedMessage).catch(console.error);
        }
    }
    resetCallUI();
}

// 5. TRÁI TIM WEBRTC: BẮT GÓI HÀNG VÀ KẾT NỐI (P2P)
async function processWebRTCData(senderId, type, payload) {
    if (senderId !== currentCallTargetId) return;

    const data = JSON.parse(payload);

    if (type === "offer") {
        createPeerConnection();
        await rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(data));

        // Trả lời lại (Answer)
        const answer = await rtcPeerConnection.createAnswer();
        await rtcPeerConnection.setLocalDescription(answer);
        connection.invoke("SendWebRTCData", currentCallTargetId, "answer", JSON.stringify(answer));
    }
    else if (type === "answer") {
        await rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(data));
    }
    else if (type === "ice") {
        // Bắt tọa độ mạng của đối phương
        try {
            await rtcPeerConnection.addIceCandidate(new RTCIceCandidate(data));
        } catch (e) { console.error("Lỗi thêm ICE Candidate:", e); }
    }
}

// 6. XÂY DỰNG CẦU NỐI P2P
function createPeerConnection() {
    rtcPeerConnection = new RTCPeerConnection(rtcConfig);

    // Chuẩn bị khung <video> to để hứng hình ảnh của bạn bè
    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;

    // Khi bạn bè truyền track (video/audio) sang, nhét nó vào thẻ video
    rtcPeerConnection.ontrack = event => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    // Khi đục tường lửa tìm thấy địa chỉ IP (ICE), gửi cho bạn bè
    rtcPeerConnection.onicecandidate = event => {
        if (event.candidate) {
            connection.invoke("SendWebRTCData", currentCallTargetId, "ice", JSON.stringify(event.candidate));
        }
    };

    // Đẩy luồng Camera/Mic của mình vào đường ống P2P
    if (localStream) {
        localStream.getTracks().forEach(track => {
            rtcPeerConnection.addTrack(track, localStream);
        });
    }
}
// 7. CÚP MÁY VÀ GHI LOG
function endCall() {
    if (currentCallTargetId && connection.state === "Connected") {
        // Báo cho máy kia biết mình cúp máy
        connection.invoke("EndCall", currentCallTargetId).catch(() => { });

        // Tự động tạo log nếu mình tự bấm cúp máy
        generateCallLog();
    }
    resetCallUI();
}

// HÀM TẠO LỊCH SỬ CUỘC GỌI
function generateCallLog() {
    // Chỉ máy người gọi (isCaller) mới tạo Log để tránh bị nhân đôi 2 tin nhắn
    if (isCaller && currentCallTargetId && connection.state === "Connected") {
        let duration = 0;
        if (callStartTime) {
            duration = Math.floor((Date.now() - callStartTime) / 1000); // Tính ra số giây
        }
        const callType = isVideoCallActive ? "VIDEO" : "AUDIO";
        const callLogStr = `[CALL|${callType}|${duration}]`;

        // Đóng gói và gửi như 1 tin nhắn mật
        const encryptedMessage = CryptoJS.AES.encrypt(callLogStr, currentSecretKey).toString();
        connection.invoke("SendPrivateMessage", currentCallTargetId, encryptedMessage).catch(console.error);
    }
}

function resetCallUI() {
    // 1. TẮT CHUÔNG VÀ HỦY BỘ ĐẾM 45S NGAY LẬP TỨC
    stopRingtone();
    clearTimeout(callTimeoutId);
    document.getElementById("floatingCallBadge")?.classList.add("hidden");

    // 2. ẨN GIAO DIỆN
    const overlay = document.getElementById("callOverlay");
    overlay.classList.add("hidden", "opacity-0");
    document.getElementById("remoteVideo").srcObject = null;
    document.getElementById("localVideo").srcObject = null;

    // 3. TẮT CAMERA VÀ WEBRTC
    if (rtcPeerConnection) {
        rtcPeerConnection.close();
        rtcPeerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    currentCallTargetId = null;
}
// 8. TẮT MỞ CAMERA / MICRO TRONG LÚC GỌI
function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById("btnMuteMic");
            if (audioTrack.enabled) {
                btn.innerHTML = '<i class="fa-solid fa-microphone text-xl"></i>';
                btn.classList.replace("bg-red-500", "bg-gray-700");
            } else {
                btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-xl"></i>';
                btn.classList.replace("bg-gray-700", "bg-red-500");
            }
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.getElementById("btnToggleCam");
            if (videoTrack.enabled) {
                btn.innerHTML = '<i class="fa-solid fa-video text-xl"></i>';
                btn.classList.replace("bg-red-500", "bg-gray-700");
            } else {
                btn.innerHTML = '<i class="fa-solid fa-video-slash text-xl"></i>';
                btn.classList.replace("bg-gray-700", "bg-red-500");
            }
        }
    }
}

// HỆ THỐNG ÂM THANH VÀ THU NHỎ
function playRingtone() { document.getElementById("sound-ring")?.play().catch(e => console.log("Trình duyệt chặn tự động phát nhạc")); }
function stopRingtone() {
    const r = document.getElementById("sound-ring");
    if (r) { r.pause(); r.currentTime = 0; }
}

function minimizeCall() {
    document.getElementById("callOverlay").classList.add("hidden", "opacity-0");
    document.getElementById("floatingCallBadge").classList.remove("hidden");
}

function maximizeCall() {
    document.getElementById("callOverlay").classList.remove("hidden", "opacity-0");
    document.getElementById("floatingCallBadge").classList.add("hidden");
}
// BẢO VỆ CUỘC GỌI: CẢNH BÁO KHI CHUYỂN TRANG
window.addEventListener("beforeunload", function (e) {
    // Nếu đang có cuộc gọi diễn ra hoặc chuông đang reo
    if (currentCallTargetId || document.getElementById("callOverlay") && !document.getElementById("callOverlay").classList.contains("hidden")) {
        // Tự động cúp máy báo cho bên kia biết
        if (connection && connection.state === "Connected") {
            connection.invoke("EndCall", currentCallTargetId).catch(() => { });
        }

        // Hiện thông báo cảnh báo của Trình duyệt
        e.preventDefault();
        e.returnValue = "Bạn đang trong cuộc gọi. Nếu rời khỏi trang này, cuộc gọi sẽ bị ngắt. Bạn có chắc chắn muốn thoát?";
        return e.returnValue;
    }
});

function deleteForMe(messageId) {
    if (!currentChatTarget || !connection || connection.state !== "Connected") return;
    if (confirm("Xóa tin nhắn này ở phía bạn? (Người khác vẫn sẽ thấy tin nhắn này)")) {
        connection.invoke("DeleteMessageForMe", messageId).catch(console.error);
    }
}

function replyToMessage(msgId, senderName, textSnippet) {
    currentReplyToMessage = { id: msgId, name: senderName, text: textSnippet };
    let replyBox = document.getElementById("replyPreviewBox");

    // Tự động sinh ra UI hộp trích dẫn nằm phía trên ô nhập tin nhắn
    if (!replyBox) {
        const inputContainer = document.getElementById("messageInput").parentElement;
        replyBox = document.createElement("div");
        replyBox.id = "replyPreviewBox";
        replyBox.className = "w-full bg-themeBg border-t border-themeBorder px-4 py-2 flex items-center justify-between text-xs transition-all";
        inputContainer.parentElement.insertBefore(replyBox, inputContainer);
    }

    replyBox.innerHTML = `
        <div class="flex-1 border-l-4 border-primary pl-2 overflow-hidden">
            <div class="font-bold text-themeText">Đang trả lời: ${senderName}</div>
            <div class="text-themeSub truncate">${textSnippet}</div>
        </div>
        <button onclick="cancelReply()" class="text-themeSub hover:text-red-500 px-3 py-1 transition"><i class="fa-solid fa-xmark text-lg"></i></button>
    `;
    replyBox.classList.remove("hidden");
    document.getElementById("messageInput").focus();
}

function cancelReply() {
    currentReplyToMessage = null;
    const replyBox = document.getElementById("replyPreviewBox");
    if (replyBox) replyBox.classList.add("hidden");
}

