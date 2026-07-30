const BASE_URL = "";
let connection;
let myProfile = null; 
let currentChatTarget = null;
let currentSecretKey = ""; 
let loadHistoryTimeout; 
let typingTimeout;
let isTyping = false;

function getSafeAvatar(avatarUrl, username, sizeClass = "w-10 h-10", textClass = "text-base") {
    if (avatarUrl) {
        const fullUrl = avatarUrl.startsWith('http') ? avatarUrl : BASE_URL + avatarUrl;
        return `<img src="${fullUrl}" class="${sizeClass} rounded-full object-cover border border-themeBorder flex-shrink-0">`;
    }
    return `<div class="${sizeClass} rounded-full bg-blue-100 text-primary font-bold flex items-center justify-center flex-shrink-0 ${textClass}">${(username || 'U').substring(0,2).toUpperCase()}</div>`;
}

window.onload = async function() {
    const token = localStorage.getItem("jwtToken");
    if (!token) { window.location.href = "index.html"; return; }

    try {
        myProfile = await fetch(`${BASE_URL}/api/user/me`, {
            headers: { "Authorization": "Bearer " + token }
        }).then(res => res.json());
    } catch (e) { console.error("Lỗi lấy Profile:", e); }
    
    loadFriendList(token);
    await initSignalR(token);

    const urlParams = new URLSearchParams(window.location.search);
    const autoTargetId = urlParams.get("targetId");
    if (autoTargetId) {
        autoStartChat(autoTargetId, token);
    }

    const msgInput = document.getElementById("messageInput");
    if (msgInput) {
        msgInput.addEventListener("input", function() {
            if (!currentChatTarget || !connection || connection.state !== "Connected") return;
            if (!isTyping) { isTyping = true; connection.invoke("SendTypingState", currentChatTarget.id, true).catch(console.error); }
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => { isTyping = false; connection.invoke("SendTypingState", currentChatTarget.id, false).catch(console.error); }, 2000); 
        });

        msgInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
            }
        });
    }
};

async function loadFriendList(token) {
    try {
        const res = await fetch(`${BASE_URL}/api/user/recent-chats`, { headers: { "Authorization": "Bearer " + token } });
        if (res.ok) {
            const contacts = await res.json();
            const container = document.getElementById("friendListContainer");
            if (!container) return;
            container.innerHTML = "";
            if (contacts.length === 0) { container.innerHTML = `<div class="text-center text-themeSub text-sm p-4">Hộp thư trống.</div>`; return; }
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

async function searchUser() {
    const searchElem = document.getElementById("searchEmail"); if (!searchElem) return;
    const email = searchElem.value.trim(); if (!email) return;
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/user/search?email=${encodeURIComponent(email)}`, { headers: { "Authorization": "Bearer " + token } });
        if (res.ok) {
            const user = await res.json();
            if(user.id === myProfile.id) { alert("Bạn không thể tự chat với chính mình!"); return; }
            startChatWith(user);
        } else { alert("Không tìm thấy người dùng có Email này!"); }
    } catch (e) { alert("Lỗi mạng!"); }
}

function startChatWith(user) {
    try {
        currentChatTarget = user;
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

// BẢN NÂNG CẤP XỬ LÝ ID MESSAGE VÀ THU HỒI
function appendMessage(messageId, senderId, senderName, encryptedText, isRead = false, isRecalled = false) {
    const chatBox = document.getElementById("chatMessages");
    if (!chatBox) return;
    
    if (document.getElementById("loading-spinner") || chatBox.innerHTML.includes("Chưa có tin nhắn nào")) chatBox.innerHTML = "";

    const existingIndicator = document.getElementById("typingIndicator"); if (existingIndicator) existingIndicator.remove();
    const oldSeen = document.getElementById("seenStatus"); if (oldSeen) oldSeen.remove();

    const isMe = (senderId === myProfile.id);
    const msgDiv = document.createElement("div");
    msgDiv.id = `msg-${messageId}`; // Gắn ID để dễ tìm mà thu hồi
    msgDiv.className = `flex flex-col max-w-[70%] ${isMe ? 'self-end' : 'self-start'} mb-1`;
    
    const nameLabel = isMe ? '' : `<span class="text-xs text-themeSub ml-1 mb-1">${senderName}</span>`;
    const bubbleStyle = isMe 
        ? `background-color: var(--chat-me); color: white; border-bottom-right-radius: 4px;` 
        : `background-color: var(--chat-other); color: var(--chat-text-other); border-bottom-left-radius: 4px;`;

    if (isRecalled) {
        msgDiv.innerHTML = `
            ${nameLabel}
            <div class="px-4 py-2 rounded-2xl shadow-sm italic opacity-70 bg-transparent border border-themeBorder text-themeSub text-sm">
                <i class="fa-solid fa-rotate-left mr-1"></i> Tin nhắn đã bị thu hồi
            </div>
        `;
    } else {
        const decryptedText = decryptMessage(encryptedText);
        // Nút thu hồi chỉ hiện khi hover vào tin nhắn của mình
        const recallBtn = isMe ? `<button onclick="recallMessage('${messageId}')" class="absolute -left-6 top-1/2 -translate-y-1/2 text-red-500 opacity-0 group-hover:opacity-100 transition duration-200" title="Thu hồi tin nhắn"><i class="fa-solid fa-rotate-left"></i></button>` : '';

        msgDiv.innerHTML = `
            ${nameLabel}
            <div class="relative group flex items-center">
                ${recallBtn}
                <div class="px-4 py-2 rounded-2xl shadow-sm whitespace-pre-wrap break-words w-full" style="${bubbleStyle}">${formatMentions(decryptedText)}</div>
            </div>
        `;

        if (isMe && isRead) {
            msgDiv.innerHTML += `<div id="seenStatus" class="text-[10px] text-themeSub text-right mt-1 px-1"><i class="fa-solid fa-circle-check text-green-500"></i> Đã xem</div>`;
        }
    }
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// GỌI API THU HỒI
function recallMessage(messageId) {
    if (!currentChatTarget || !connection || connection.state !== "Connected") return;
    if(confirm("Thu hồi tin nhắn này ở cả hai phía?")) {
        connection.invoke("RecallMessage", currentChatTarget.id, messageId).catch(console.error);
    }
}

async function initSignalR(token) {
    connection = new signalR.HubConnectionBuilder()
        .withUrl(`${BASE_URL}/chathub`, { accessTokenFactory: () => token })
        .withAutomaticReconnect().build();

    connection.on("LoadHistory", function (history) {
        clearTimeout(loadHistoryTimeout); 
        const chatBox = document.getElementById("chatMessages");
        if (chatBox) chatBox.innerHTML = ""; 
        if (!history || history.length === 0) {
            if (chatBox) chatBox.innerHTML = `<div class="text-center text-themeSub text-xs py-10 italic">Chưa có tin nhắn nào. Hãy bắt chuyện!</div>`;
            return;
        }
        history.forEach(msg => {
            appendMessage(msg.id || msg.Id, msg.senderId || msg.SenderId, msg.senderUsername || msg.SenderUsername, msg.content || msg.Content, msg.isRead || msg.IsRead, msg.isRecalled || msg.IsRecalled);
        });

        if (currentChatTarget && connection.state === "Connected") {
            connection.invoke("MarkAsRead", currentChatTarget.id).catch(console.error);
        }
    });

    connection.on("ReceiveMessage", function (messageId, userId, user, encryptedMessage, isRecalled) {
        if (currentChatTarget && (userId === currentChatTarget.id || userId === myProfile.id)) {
            appendMessage(messageId, userId, user, encryptedMessage, false, isRecalled);
            if (userId === currentChatTarget.id && connection.state === "Connected") {
                connection.invoke("MarkAsRead", currentChatTarget.id).catch(console.error);
            }
        }
    });

    // MẮT THẦN LẮNG NGHE TÍN HIỆU THU HỒI
    connection.on("ReceiveMessageRecalled", function (messageId) {
        const msgDiv = document.getElementById(`msg-${messageId}`);
        if (msgDiv) {
            // Thay thế nội dung bằng hộp thoại "Đã thu hồi"
            const nameLabel = msgDiv.querySelector('span') ? msgDiv.querySelector('span').outerHTML : '';
            msgDiv.innerHTML = `
                ${nameLabel}
                <div class="px-4 py-2 rounded-2xl shadow-sm italic opacity-70 bg-transparent border border-themeBorder text-themeSub text-sm">
                    <i class="fa-solid fa-rotate-left mr-1"></i> Tin nhắn đã bị thu hồi
                </div>
            `;
        }
    });

    connection.on("ReceiveTypingState", function (userId, isUserTyping) {
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

    connection.on("ReceiveReadReceipt", function (readerId) {
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

    try {
        await connection.start();
        if (currentChatTarget) connection.invoke("LoadPrivateHistory", currentChatTarget.id).catch(console.error);
    } catch (err) { console.error("Lỗi kết nối SignalR:", err); }
}

function sendMessage() {
    if (!currentChatTarget) return;
    const input = document.getElementById("messageInput");
    const message = input.value;
    if (!message.trim()) return;

    const encryptedMessage = CryptoJS.AES.encrypt(message, currentSecretKey).toString();
    if (connection && connection.state === "Connected") {
        connection.invoke("SendPrivateMessage", currentChatTarget.id, encryptedMessage).catch(err => console.error(err));
    }
    input.value = ""; 
    input.focus();

    if (connection && connection.state === "Connected") {
        clearTimeout(typingTimeout); isTyping = false;
        connection.invoke("SendTypingState", currentChatTarget.id, false).catch(console.error);
    }
}