const BASE_URL = "";
let currentProfileId = null;
let isOwnerGlobal = false;

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

    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get("id");

    const myProfile = await fetch(`${BASE_URL}/api/user/me`, { headers: { "Authorization": "Bearer " + token } }).then(res => res.json());

    currentProfileId = targetUserId || myProfile.id;
    isOwnerGlobal = (currentProfileId === myProfile.id);
    loadProfileInfo(currentProfileId, token, isOwnerGlobal);
};

function switchTab(tabName) {
    const token = localStorage.getItem("jwtToken");
    
    if (!isOwnerGlobal && (tabName === 'requests' || tabName === 'saved')) {
        document.getElementById("tabContentContainer").innerHTML = `<div class="text-center text-red-500 py-10 font-bold">Bạn không có quyền xem thông tin này!</div>`;
        return;
    }

    ['posts', 'photos', 'videos', 'friends', 'following', 'requests', 'saved'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if (btn) {
            if (!isOwnerGlobal && (t === 'requests' || t === 'saved')) { btn.className = "hidden"; return; }
            if (t === tabName) btn.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm bg-primary text-white transition whitespace-nowrap";
            else btn.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm text-themeSub hover:bg-themeBg transition whitespace-nowrap";
        }
    });

    const container = document.getElementById("tabContentContainer");
    if (!container) return;
    container.innerHTML = `<div class="text-center py-10 text-themeSub"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>`;

    if (tabName === 'posts') loadUserPosts(currentProfileId, token);
    else if (tabName === 'photos') loadMediaTimeline(currentProfileId, token, 'photo');
    else if (tabName === 'videos') loadMediaTimeline(currentProfileId, token, 'video');
    else if (tabName === 'friends') loadFriendsTab(currentProfileId, token);
    else if (tabName === 'following') loadFollowingTab(currentProfileId, token);
    else if (tabName === 'requests') loadRequestsTab(token);
    else if (tabName === 'saved') loadSavedPosts(token);
}

function renderMainProfileHeader(profile) {
    const avatarContainer = document.getElementById("userAvatarContainer");
    if(avatarContainer) {
        if (profile.avatarUrl) {
            const fullUrl = profile.avatarUrl.startsWith('http') ? profile.avatarUrl : BASE_URL + profile.avatarUrl;
            avatarContainer.innerHTML = `<img src="${fullUrl}" class="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-themePanel object-cover shadow-sm">`;
        } else {
            avatarContainer.innerHTML = `<div class="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-themePanel bg-blue-100 flex items-center justify-center text-5xl font-bold text-primary shadow-sm">${profile.username.substring(0,2).toUpperCase()}</div>`;
        }
    }

    if (profile.coverUrl) {
        const coverPhoto = document.getElementById("coverPhoto");
        const fullCoverUrl = profile.coverUrl.startsWith('http') ? profile.coverUrl : BASE_URL + profile.coverUrl;
        if(coverPhoto) coverPhoto.style.backgroundImage = `url('${fullCoverUrl}')`;
    }

    const bioElem = document.getElementById("profileBio");
    if (bioElem) {
        if (profile.bio && profile.bio.trim() !== "") { bioElem.innerText = profile.bio; bioElem.classList.remove("hidden"); } 
        else { bioElem.classList.add("hidden"); }
    }
}

async function loadProfileInfo(userId, token, isOwner) {
    if (isOwner) {
        const res = await fetch(`${BASE_URL}/api/user/me`, { headers: { "Authorization": "Bearer " + token } }).then(res => res.json());
        document.getElementById("profileName").innerText = res.username;
        document.getElementById("profileEmail").innerText = res.email;
        renderMainProfileHeader(res); 

        document.getElementById("actionArea").innerHTML = `<button onclick="location.href='settings.html'" class="bg-themeBg hover:opacity-80 text-themeText border border-themeBorder font-bold py-2 px-6 rounded-lg transition shadow-sm"><i class="fa-solid fa-pen mr-2"></i>Chỉnh sửa trang</button>`;
        const reqTab = document.getElementById("tab-requests"); if(reqTab) reqTab.classList.remove("hidden");
        const savedTab = document.getElementById("tab-saved"); if(savedTab) savedTab.classList.remove("hidden");

        const urlParams = new URLSearchParams(window.location.search);
        switchTab(urlParams.get("tab") || 'posts');
    } else {
        try {
            const res = await fetch(`${BASE_URL}/api/user/profile/${userId}`, { headers: { "Authorization": "Bearer " + token } });
            if (res.status === 403) {
                const errData = await res.json();
                document.getElementById("profileName").innerText = "Người dùng DevTrong"; document.getElementById("profileEmail").innerText = "Không khả dụng"; document.getElementById("actionArea").innerHTML = "";
                document.getElementById("tabContentContainer").innerHTML = `<div class="bg-themePanel p-12 rounded-xl text-center border border-themeBorder shadow-sm"><i class="fa-solid fa-user-lock text-5xl text-red-500 mb-4"></i><h3 class="text-xl font-bold text-themeText mb-2">Trang cá nhân bị hạn chế</h3><p class="text-themeSub">${errData.message || "Bạn không thể xem nội dung của người dùng này."}</p></div>`;
                return;
            }

            if (res.ok) {
                const profile = await res.json();
                document.getElementById("profileName").innerText = profile.username; document.getElementById("profileEmail").innerText = profile.email; renderMainProfileHeader(profile);
                
                let friendBtnHtml = ""; let followBtnHtml = ""; let messageBtnHtml = ""; let blockBtnHtml = ""; let reportBtnHtml = "";

                if (profile.friendStatus === "friend") friendBtnHtml = `<button onclick="removeFriend('${userId}')" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition text-sm"><i class="fa-solid fa-user-check mr-1"></i> Bạn bè</button>`;
                else if (profile.friendStatus === "pending_sent") friendBtnHtml = `<button onclick="removeFriend('${userId}')" class="bg-gray-400 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg transition text-sm"><i class="fa-solid fa-user-clock mr-1"></i> Hủy lời mời</button>`;
                else if (profile.friendStatus === "pending_received") friendBtnHtml = `<button onclick="acceptFriend('${userId}')" class="bg-secondary hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg transition text-sm mr-1"><i class="fa-solid fa-check mr-1"></i> Chấp nhận</button> <button onclick="removeFriend('${userId}')" class="bg-gray-400 hover:bg-red-500 text-white font-bold py-2 px-3 rounded-lg transition text-sm"><i class="fa-solid fa-xmark mr-1"></i> Từ chối</button>`;
                else friendBtnHtml = `<button onclick="sendFriendRequest('${userId}')" class="bg-primary hover:opacity-80 text-white font-bold py-2 px-4 rounded-lg transition text-sm shadow-sm"><i class="fa-solid fa-user-plus mr-1"></i> Thêm bạn bè</button>`;

                if (profile.isFollowing) followBtnHtml = `<button onclick="toggleFollow('${userId}')" id="btnFollow" class="bg-themeBg text-themeText border border-themeBorder font-bold py-2 px-4 rounded-lg transition text-sm"><i class="fa-solid fa-rss mr-1"></i> Đang theo dõi</button>`;
                else followBtnHtml = `<button onclick="toggleFollow('${userId}')" id="btnFollow" class="bg-themeBg text-primary border border-primary font-bold py-2 px-4 rounded-lg transition text-sm shadow-sm"><i class="fa-solid fa-plus mr-1"></i> Theo dõi</button>`;

                messageBtnHtml = `<button onclick="location.href='chat.html?targetId=${userId}'" class="bg-themeBg hover:opacity-80 text-themeText border border-themeBorder font-bold py-2 px-4 rounded-lg transition text-sm"><i class="fa-solid fa-message mr-1"></i> Nhắn tin</button>`;
                blockBtnHtml = `<button onclick="blockUser('${userId}')" class="bg-red-100 hover:bg-red-200 text-red-600 font-bold py-2 px-3 rounded-lg transition text-sm"><i class="fa-solid fa-ban"></i> Chặn</button>`;
                reportBtnHtml = `<button onclick="submitReport('User', '${userId}')" class="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-themeText border border-themeBorder font-bold py-2 px-3 rounded-lg transition text-sm shadow-sm"><i class="fa-solid fa-flag text-red-500"></i></button>`;

                document.getElementById("actionArea").innerHTML = `<div class="flex items-center gap-2 flex-wrap">${friendBtnHtml}${followBtnHtml}${messageBtnHtml}${blockBtnHtml}${reportBtnHtml}</div>`;
                
                const urlParams = new URLSearchParams(window.location.search);
                switchTab(urlParams.get("tab") || 'posts');
            }
        } catch (e) { console.error("Lỗi:", e); }
    }
}

async function untagPost(postId) {
    if(!confirm("Bạn có chắc chắn muốn gỡ thẻ tên mình khỏi bài viết này?")) return;
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/post/${postId}/untag`, { method: "POST", headers: { "Authorization": "Bearer " + token } });
        if(res.ok) { alert("Đã gỡ thẻ thành công!"); switchTab('posts'); }
        else { const text = await res.text(); alert(text); }
    } catch (e) { console.error(e); }
}

function loadMediaTimeline(userId, token, type) {
    fetch(`${BASE_URL}/api/post/user/${userId}`, { headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json()).then(posts => {
        const container = document.getElementById("tabContentContainer");
        container.innerHTML = `<div class="grid grid-cols-3 gap-1 md:gap-2"></div>`;
        const grid = container.querySelector('div');

        const mediaPosts = posts.filter(p => p.imageUrl && !p.isShare && (type === 'video' ? p.imageUrl.match(/\.(mp4|webm|mov|ogg|m4v)/i) : !p.imageUrl.match(/\.(mp4|webm|mov|ogg|m4v)/i)));

        if(mediaPosts.length === 0) {
            container.innerHTML = `<div class="bg-themePanel p-10 rounded-xl shadow-sm text-center border border-themeBorder text-themeSub font-medium">Chưa có ${type === 'video' ? 'video' : 'ảnh'} nào.</div>`; return;
        }

        mediaPosts.forEach(p => {
            const fullUrl = p.imageUrl.startsWith('http') ? p.imageUrl : BASE_URL + p.imageUrl;
            if(type === 'video') {
                grid.innerHTML += `<div class="aspect-square bg-black overflow-hidden relative cursor-pointer group rounded-lg" onclick="switchTab('posts'); setTimeout(() => window.location.hash = 'post-${p.id}', 500);"><video src="${fullUrl}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition duration-300"></video><i class="fa-solid fa-play absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-3xl opacity-80 group-hover:scale-110 transition duration-300"></i></div>`;
            } else {
                grid.innerHTML += `<div class="aspect-square bg-themeBg overflow-hidden cursor-pointer rounded-lg" onclick="switchTab('posts'); setTimeout(() => window.location.hash = 'post-${p.id}', 500);"><img src="${fullUrl}" class="w-full h-full object-cover hover:scale-105 transition duration-300"></div>`;
            }
        });
    });
}

function loadUserPosts(userId, token) {
    fetch(`${BASE_URL}/api/post/user/${userId}`, { headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json()).then(posts => renderPosts(posts, token));
}

function loadSavedPosts(token) {
    fetch(`${BASE_URL}/api/post/saved`, { headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json())
    .then(posts => {
        if(posts.length === 0) { document.getElementById("tabContentContainer").innerHTML = `<div class="bg-themePanel p-10 rounded-xl shadow-sm text-center border border-themeBorder text-themeSub font-medium"><i class="fa-regular fa-bookmark text-4xl mb-3"></i><br>Bạn chưa lưu bài viết nào.</div>`; return; }
        renderPosts(posts, token);
    });
}

function renderPosts(posts, token) {
    const container = document.getElementById("tabContentContainer");
    container.innerHTML = "";
    if(!posts || posts.length === 0) { container.innerHTML = `<div class="bg-themePanel p-10 rounded-xl shadow-sm text-center border border-themeBorder text-themeSub font-medium">Người dùng này chưa có bài viết nào.</div>`; return; }

    posts.forEach(post => {
        let imgHtml = '';
        if (post.imageUrl && !post.isShare) {
            const fullImgUrl = post.imageUrl.startsWith('http') ? post.imageUrl : BASE_URL + post.imageUrl;
            const isVideo = fullImgUrl.match(/\.(mp4|webm|mov|ogg|m4v)/i);
            if (isVideo) imgHtml = `<video src="${fullImgUrl}" controls class="w-full max-h-[500px] object-contain mt-3 bg-black border-y border-themeBorder"></video>`;
            else imgHtml = `<img src="${fullImgUrl}" class="w-full max-h-[500px] object-cover mt-3 border-y border-themeBorder">`;
        }

        let originalPostHtml = '';
        if (post.isShare) {
            if (post.originalPost === "unavailable") {
                originalPostHtml = `<div class="mt-3 p-4 border border-themeBorder rounded-lg bg-themeBg text-themeSub italic text-sm"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Nội dung này không còn tồn tại hoặc đã bị giới hạn quyền riêng tư.</div>`;
            } else if (post.originalPost) {
                const origFullImgUrl = post.originalPost.imageUrl ? (post.originalPost.imageUrl.startsWith('http') ? post.originalPost.imageUrl : BASE_URL + post.originalPost.imageUrl) : '';
                let origImgHtml = '';
                if (origFullImgUrl) {
                    const isOrigVideo = origFullImgUrl.match(/\.(mp4|webm|mov|ogg|m4v)/i);
                    origImgHtml = isOrigVideo ? `<video src="${origFullImgUrl}" controls class="w-full max-h-64 object-contain mt-2 bg-black rounded-lg"></video>` : `<img src="${origFullImgUrl}" class="w-full max-h-64 object-cover mt-2 rounded-lg">`;
                }
                originalPostHtml = `
                    <div class="mt-3 p-4 border border-themeBorder rounded-xl bg-themeBg cursor-pointer hover:bg-gray-50 transition" onclick="location.href='profile.html?id=${post.originalPost.userId}'">
                        <div class="font-bold text-themeText text-sm flex items-center gap-2 mb-2"><i class="fa-solid fa-share text-primary"></i> ${getSafeAvatar(post.originalPost.authorAvatar, post.originalPost.authorName, "w-6 h-6", "text-[10px]")} Đã chia sẻ từ: ${post.originalPost.authorName}</div>
                        <div class="text-[11px] text-themeSub mb-2">${new Date(post.originalPost.createdAt).toLocaleString()}</div>
                        <div class="text-themeText text-sm whitespace-pre-wrap">${formatMentions(post.originalPost.content)}</div>
                        ${origImgHtml}
                    </div>`;
            }
        }

        const timeStr = new Date(post.createdAt).toLocaleString();
        let privacyIcon = '<i class="fa-solid fa-earth-americas ml-2"></i>'; if (post.privacy === 1) privacyIcon = '<i class="fa-solid fa-user-group ml-2"></i>'; if (post.privacy === 2) privacyIcon = '<i class="fa-solid fa-lock ml-2"></i>';

        const btnDelete = isOwnerGlobal ? `<button onclick="deletePost('${post.id}')" class="text-themeSub hover:text-red-500 transition ml-2" title="Xóa bài viết"><i class="fa-solid fa-trash text-xl"></i></button>` : '';
        
        let untagBtn = '';
        if(MY_GLOBAL_PROFILE_DATA && post.content.includes(`@[${MY_GLOBAL_PROFILE_DATA.username}](${MY_GLOBAL_PROFILE_DATA.id})`)) {
            untagBtn = `<button onclick="untagPost('${post.id}')" class="text-themeSub hover:text-orange-500 transition ml-2" title="Gỡ thẻ tên tôi"><i class="fa-solid fa-user-minus text-xl"></i></button>`;
        }

        let reactUI = { icon: `<i class="fa-solid fa-thumbs-up"></i>`, text: "Thích", color: "text-themeSub" };
        if (post.userReaction && REACTION_CONFIG[post.userReaction]) { reactUI = REACTION_CONFIG[post.userReaction]; reactUI.color += " font-bold"; }

        const postCard = `
            <div id="post-${post.id}" class="bg-themePanel rounded-xl shadow-sm border border-themeBorder overflow-hidden transition-colors relative mb-4">
                <div class="absolute top-4 right-4 flex items-center gap-4 z-10">
                    <button onclick="toggleSavePost('${post.id}', this)" class="text-themeSub hover:text-primary transition" title="Lưu / Bỏ lưu"><i class="${post.isSaved ? 'fa-solid text-primary' : 'fa-regular'} fa-bookmark text-xl"></i></button>
                    <button onclick="submitReport('Post', '${post.id}')" class="text-themeSub hover:text-red-500 transition" title="Báo cáo bài viết"><i class="fa-solid fa-flag text-xl"></i></button>
                    ${btnDelete}${untagBtn}
                </div>

                <div class="p-4 pb-2 flex items-center gap-3 cursor-pointer pr-32" onclick="location.href='profile.html?id=${post.userId}'">
                    ${getSafeAvatar(post.authorAvatar, post.authorName, "w-10 h-10")}
                    <div>
                        <div class="font-bold text-themeText leading-tight hover:underline">${post.authorName}</div>
                        <div class="text-xs text-themeSub flex items-center">${timeStr} ${privacyIcon}</div>
                    </div>
                </div>
                <div class="px-4 text-themeText text-[15px] whitespace-pre-wrap">${formatMentions(post.content)}</div>
                ${imgHtml}
                <div class="px-4">${originalPostHtml}</div>

                <div class="px-4 py-2 border-t border-themeBorder flex justify-between text-themeSub text-sm mt-3 relative overflow-visible">
                    <div class="flex-1 group relative flex justify-center">
                        <div class="absolute bottom-full left-0 pb-2 hidden group-hover:flex z-50">
                            <div class="bg-themePanel border border-themeBorder shadow-xl rounded-full px-3 py-2 flex gap-3">
                                <button onclick="reactPost('${post.id}', 'Like')" class="text-2xl hover:-translate-y-2 transition transform">👍</button>
                                <button onclick="reactPost('${post.id}', 'Love')" class="text-2xl hover:-translate-y-2 transition transform">❤️</button>
                                <button onclick="reactPost('${post.id}', 'Haha')" class="text-2xl hover:-translate-y-2 transition transform">😂</button>
                                <button onclick="reactPost('${post.id}', 'Wow')" class="text-2xl hover:-translate-y-2 transition transform">😮</button>
                                <button onclick="reactPost('${post.id}', 'Sad')" class="text-2xl hover:-translate-y-2 transition transform">😢</button>
                                <button onclick="reactPost('${post.id}', 'Angry')" class="text-2xl hover:-translate-y-2 transition transform">😡</button>
                            </div>
                        </div>
                        <button id="btn-like-${post.id}" onclick="reactPost('${post.id}', 'Like')" class="w-full py-2 hover:bg-themeBg rounded-lg transition font-medium text-center flex items-center justify-center gap-1 ${reactUI.color}">
                            <span id="reaction-icon-${post.id}">${reactUI.icon} ${reactUI.text}</span> (<span id="like-${post.id}">${post.likeCount}</span>)
                        </button>
                    </div>
                    <button onclick="toggleCommentSection('${post.id}')" class="flex-1 py-2 hover:bg-themeBg rounded-lg transition font-medium text-center"><i class="fa-solid fa-comment mr-1"></i> Bình luận (${post.commentCount})</button>
                    <button onclick="sharePostPrompt('${post.isShare ? (post.originalPost?.id || '') : post.id}')" class="flex-1 py-2 hover:bg-themeBg rounded-lg transition font-medium text-center"><i class="fa-solid fa-share mr-1"></i> Chia sẻ (${post.shareCount})</button>
                </div>

                <div id="comment-section-${post.id}" class="hidden p-4 border-t border-themeBorder bg-themeBg/50 transition-colors">
                    <div id="comment-list-${post.id}" class="space-y-3 mb-3"></div>
                    <div class="flex gap-2 relative">
                        <button onclick="toggleMentionPicker('comment-input-${post.id}', this)" class="mention-btn text-themeSub hover:text-primary text-xl px-2 transition hover:scale-110"><i class="fa-solid fa-at"></i></button>
                        <button onclick="toggleEmojiPicker('comment-input-${post.id}', this)" class="emoji-btn text-themeSub hover:text-primary text-xl px-2 transition hover:scale-110"><i class="fa-regular fa-face-smile"></i></button>
                        <input type="text" id="comment-input-${post.id}" placeholder="Viết bình luận..." onkeypress="if(event.ctrlKey && event.key==='Enter') submitComment('${post.id}')" class="flex-1 px-3 py-2 bg-themePanel text-themeText border border-themeBorder rounded-lg focus:outline-none focus:border-primary text-sm">
                        <button onclick="submitComment('${post.id}')" class="bg-primary text-white font-bold px-4 py-2 rounded-lg hover:opacity-80 transition text-sm">Gửi</button>
                    </div>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', postCard);
    });

    setTimeout(() => {
        const hash = window.location.hash;
        if (hash) {
            const targetPost = document.querySelector(hash);
            if (targetPost) {
                targetPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetPost.style.boxShadow = "0 0 0 4px var(--primary)";
                setTimeout(() => { targetPost.style.boxShadow = "none"; }, 3000);
            }
        }
    }, 200);
}

async function submitReport(targetType, targetId) { const reason = prompt(`Nhập lý do báo cáo:`); if (!reason || !reason.trim()) return; const token = localStorage.getItem("jwtToken"); try { const res = await fetch(`${BASE_URL}/api/report`, { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ targetType, targetId, reason: reason.trim() }) }); const data = await res.json(); alert(data.message || "Đã báo cáo!"); } catch (e) { alert("Lỗi gửi báo cáo."); } }
async function deletePost(postId) { if(!confirm("Xóa bài viết vĩnh viễn?")) return; const token = localStorage.getItem("jwtToken"); try { const res = await fetch(`${BASE_URL}/api/post/${postId}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } }); if(res.ok) { alert("Đã xóa bài viết!"); switchTab('posts'); } } catch (e) { alert("Lỗi khi xóa bài."); } }
function blockUser(targetId) { const reason = prompt("Lý do chặn:"); if (reason === null) return; const token = localStorage.getItem("jwtToken"); fetch(`${BASE_URL}/api/block/${targetId}`, { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(reason) }).then(res => res.json()).then(data => { alert(data.message); window.location.reload(); }); }
function sendFriendRequest(targetId) { const token = localStorage.getItem("jwtToken"); fetch(`${BASE_URL}/api/friend/request/${targetId}`, { method: "POST", headers: { "Authorization": "Bearer " + token } }).then(() => loadProfileInfo(targetId, token, false)); }
function acceptFriend(targetId) { const token = localStorage.getItem("jwtToken"); fetch(`${BASE_URL}/api/friend/accept/${targetId}`, { method: "POST", headers: { "Authorization": "Bearer " + token } }).then(() => loadProfileInfo(targetId, token, false)); }
function removeFriend(targetId) { const token = localStorage.getItem("jwtToken"); fetch(`${BASE_URL}/api/friend/remove/${targetId}`, { method: "POST", headers: { "Authorization": "Bearer " + token } }).then(() => loadProfileInfo(targetId, token, false)); }
function toggleFollow(targetId) { const token = localStorage.getItem("jwtToken"); fetch(`${BASE_URL}/api/follow/${targetId}`, { method: "POST", headers: { "Authorization": "Bearer " + token } }).then(() => loadProfileInfo(targetId, token, false)); }

async function toggleSavePost(postId, btnElement) { const token = localStorage.getItem("jwtToken"); try { const res = await fetch(`${BASE_URL}/api/post/${postId}/save`, { method: "POST", headers: { "Authorization": "Bearer " + token } }); if (res.ok) { const data = await res.json(); const icon = btnElement.querySelector('i'); if (data.isSaved) { icon.className = 'fa-solid fa-bookmark text-primary text-xl'; alert("📌 " + data.message); } else { icon.className = 'fa-regular fa-bookmark text-xl'; if (document.getElementById('tab-saved').classList.contains('bg-primary')) loadSavedPosts(token); } } } catch (e) { console.error(e); } }
function sharePostPrompt(originalPostId) { if (!originalPostId) { alert("Không thể chia sẻ bài bị xóa."); return; } const caption = prompt("Nhập cảm nghĩ:"); if (caption === null) return; const token = localStorage.getItem("jwtToken"); fetch(`${BASE_URL}/api/post/${originalPostId}/share`, { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ content: caption }) }).then(res => res.json()).then(data => { alert(data.message); const currentTab = document.getElementById('tab-saved').classList.contains('bg-primary') ? 'saved' : 'posts'; switchTab(currentTab); }); }
function toggleCommentSection(postId) { const section = document.getElementById(`comment-section-${postId}`); if (section) { section.classList.toggle("hidden"); if (!section.classList.contains("hidden")) loadComments(postId); } }

function loadComments(postId) {
    const token = localStorage.getItem("jwtToken"); const container = document.getElementById(`comment-list-${postId}`); if (!container) return;
    fetch(`${BASE_URL}/api/post/${postId}/comments`, { headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json()).then(comments => {
        container.innerHTML = ""; if (comments.length === 0) { container.innerHTML = `<div class="text-xs text-themeSub italic">Chưa có bình luận nào.</div>`; return; }
        comments.forEach(c => {
            const timeStr = new Date(c.createdAt).toLocaleString('vi-VN');
            container.innerHTML += `<div class="flex gap-2"><div class="cursor-pointer" onclick="location.href='profile.html?id=${c.userId}'">${getSafeAvatar(c.authorAvatar, c.authorName, "w-8 h-8", "text-[10px]")}</div><div class="bg-themePanel p-2.5 rounded-2xl rounded-tl-none border border-themeBorder flex-1 shadow-sm"><div class="flex justify-between items-center mb-1"><span class="font-bold text-themeText text-xs cursor-pointer hover:underline" onclick="location.href='profile.html?id=${c.userId}'">${c.authorName}</span><span class="text-[10px] text-themeSub">${timeStr}</span></div><div class="text-themeText text-sm whitespace-pre-wrap">${formatMentions(c.content)}</div></div></div>`;
        });
    });
}
async function submitComment(postId) { const input = document.getElementById(`comment-input-${postId}`); const content = input ? input.value.trim() : ""; if (!content) return; const token = localStorage.getItem("jwtToken"); try { const res = await fetch(`${BASE_URL}/api/post/${postId}/comment`, { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ content: content }) }); if (res.ok) { input.value = ""; loadComments(postId); const countElem = document.querySelector(`#post-${postId} button:nth-child(2)`); if (countElem) countElem.innerHTML = `<i class="fa-solid fa-comment mr-1"></i> Bình luận`; } } catch (e) { console.error(e); } }

function loadFriendsTab(userId, token) { fetch(`${BASE_URL}/api/friend/list/${userId}`, { headers: { "Authorization": "Bearer " + token } }).then(res => res.json()).then(friends => { const container = document.getElementById("tabContentContainer"); container.innerHTML = ""; if (!friends || friends.length === 0) { container.innerHTML = `<div class="bg-themePanel p-8 rounded-xl text-center text-themeSub border border-themeBorder">Chưa có bạn bè nào.</div>`; return; } let gridHtml = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`; friends.forEach(f => { gridHtml += `<div class="bg-themePanel p-4 rounded-xl border border-themeBorder flex items-center justify-between shadow-sm hover:shadow-md transition"><div class="flex items-center gap-3 cursor-pointer" onclick="location.href='profile.html?id=${f.id}'">${getSafeAvatar(f.avatarUrl, f.username, "w-12 h-12", "text-lg")}<div><div class="font-bold text-themeText hover:underline">${f.username}</div><div class="text-xs text-themeSub">${f.email}</div></div></div></div>`; }); container.innerHTML = gridHtml + `</div>`; }); }
function loadFollowingTab(userId, token) { fetch(`${BASE_URL}/api/follow/list/${userId}`, { headers: { "Authorization": "Bearer " + token } }).then(res => res.json()).then(following => { const container = document.getElementById("tabContentContainer"); container.innerHTML = ""; if (!following || following.length === 0) { container.innerHTML = `<div class="bg-themePanel p-8 rounded-xl text-center text-themeSub border border-themeBorder">Chưa theo dõi ai.</div>`; return; } let gridHtml = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`; following.forEach(f => { gridHtml += `<div class="bg-themePanel p-4 rounded-xl border border-themeBorder flex items-center justify-between shadow-sm hover:shadow-md transition"><div class="flex items-center gap-3 cursor-pointer" onclick="location.href='profile.html?id=${f.id}'">${getSafeAvatar(f.avatarUrl, f.username, "w-12 h-12", "text-lg")}<div><div class="font-bold text-themeText hover:underline">${f.username}</div><div class="text-xs text-themeSub">${f.email}</div></div></div></div>`; }); container.innerHTML = gridHtml + `</div>`; }); }
function loadRequestsTab(token) { fetch(`${BASE_URL}/api/friend/requests`, { headers: { "Authorization": "Bearer " + token } }).then(res => res.json()).then(data => { const container = document.getElementById("tabContentContainer"); let html = `<h3 class="font-bold text-lg text-themeText mb-3 border-b border-themeBorder pb-2">Lời mời đã nhận (${data.received.length})</h3>`; if (data.received.length === 0) html += `<div class="bg-themePanel p-4 rounded-xl text-themeSub text-sm mb-6 border border-themeBorder">Không có lời mời nào.</div>`; else { html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">`; data.received.forEach(u => { html += `<div class="bg-themePanel p-4 rounded-xl border border-themeBorder flex flex-col gap-3 shadow-sm hover:shadow-md transition"><div class="flex items-center gap-3 cursor-pointer" onclick="location.href='profile.html?id=${u.id}'">${getSafeAvatar(u.avatarUrl, u.username, "w-12 h-12", "text-lg")}<div class="font-bold text-themeText hover:underline">${u.username}</div></div><div class="flex gap-2"><button onclick="actionRequestTab('${u.id}', 'accept')" class="flex-1 bg-primary text-white font-bold py-2 rounded-lg text-sm hover:opacity-80 transition">Chấp nhận</button><button onclick="actionRequestTab('${u.id}', 'remove')" class="flex-1 bg-themeBg text-themeText border border-themeBorder font-bold py-2 rounded-lg text-sm hover:bg-gray-200 transition">Từ chối</button></div></div>`; }); html += `</div>`; } html += `<h3 class="font-bold text-lg text-themeText mb-3 border-b border-themeBorder pb-2">Lời mời đã gửi đi (${data.sent.length})</h3>`; if (data.sent.length === 0) html += `<div class="bg-themePanel p-4 rounded-xl text-themeSub text-sm border border-themeBorder">Chưa gửi lời mời nào.</div>`; else { html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`; data.sent.forEach(u => { html += `<div class="bg-themePanel p-4 rounded-xl border border-themeBorder flex flex-col gap-3 shadow-sm hover:shadow-md transition"><div class="flex items-center gap-3 cursor-pointer" onclick="location.href='profile.html?id=${u.id}'">${getSafeAvatar(u.avatarUrl, u.username, "w-12 h-12", "text-lg")}<div class="font-bold text-themeText hover:underline">${u.username}</div></div><button onclick="actionRequestTab('${u.id}', 'remove')" class="w-full bg-themeBg text-themeText border border-themeBorder font-bold py-2 rounded-lg text-sm hover:bg-gray-200 transition">Hủy lời mời</button></div>`; }); html += `</div>`; } container.innerHTML = html; }); }
function actionRequestTab(targetId, action) { const token = localStorage.getItem("jwtToken"); const endpoint = action === 'accept' ? `/api/friend/accept/${targetId}` : `/api/friend/remove/${targetId}`; fetch(`${BASE_URL}${endpoint}`, { method: "POST", headers: { "Authorization": "Bearer " + token } }).then(() => loadRequestsTab(token)); }