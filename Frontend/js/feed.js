const BASE_URL = "";
let selectedImageFile = null;

let currentStoryList = [];
let activeUserIndex = 0;
let activeStoryIndex = 0;
let storyTimer = null;

let currentPage = 1;
let isFetching = false;
let hasMorePosts = true;

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
        const user = await fetch(`${BASE_URL}/api/user/me`, { headers: { "Authorization": "Bearer " + token } }).then(res => res.json());
        const createPostBox = document.querySelector('.bg-themePanel .flex.items-center.gap-3 .w-10 h-10');
        if (createPostBox) {
            createPostBox.outerHTML = getSafeAvatar(user.avatarUrl, user.username, "w-10 h-10", "text-base");
        }
    } catch (e) { console.error("Lỗi lấy thông tin user me:", e); }

    loadNewsfeed(token, true);
    loadStories(token);
};

window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        if (!isFetching && hasMorePosts) {
            currentPage++;
            loadNewsfeed(localStorage.getItem("jwtToken"), false);
        }
    }
});

function previewSelectedImage(event) {
    const file = event.target.files[0];
    if (file) {
        selectedImageFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const container = document.getElementById("mediaPreviewContent");
            if (file.type.startsWith("video/")) {
                container.innerHTML = `<video src="${e.target.result}" controls class="w-full h-full object-cover max-h-64"></video>`;
            } else {
                container.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover max-h-64">`;
            }
            document.getElementById("imagePreviewContainer").classList.remove("hidden");
        }
        reader.readAsDataURL(file);
    }
}

function removeImage() {
    selectedImageFile = null;
    document.getElementById("postImage").value = "";
    document.getElementById("imagePreviewContainer").classList.add("hidden");
    const container = document.getElementById("mediaPreviewContent");
    if(container) container.innerHTML = "";
}

function uploadMediaWithProgress(file, token, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${BASE_URL}/api/upload/image`);
        xhr.setRequestHeader("Authorization", "Bearer " + token);

        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                onProgress(percentComplete);
            }
        };

        xhr.onload = function() {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                resolve(response.url);
            } else { reject(xhr.responseText || "Lỗi tải file!"); }
        };
        xhr.onerror = function() { reject("Lỗi kết nối mạng!"); };

        const formData = new FormData();
        formData.append("file", file);
        xhr.send(formData);
    });
}

async function submitPost() {
    const content = document.getElementById("postContent").value;
    const btn = document.getElementById("btnSubmitPost");
    const token = localStorage.getItem("jwtToken");

    if (!content && !selectedImageFile) { alert("Bạn chưa nhập nội dung hoặc chọn file!"); return; }
    btn.innerText = "Đang xử lý..."; btn.disabled = true;

    try {
        let uploadedImageUrl = null;
        if (selectedImageFile) {
            const previewContent = document.getElementById("mediaPreviewContent");
            if (!document.getElementById("uploadProgressBar")) {
                previewContent.insertAdjacentHTML('beforeend', `<div class="absolute bottom-0 left-0 h-1.5 bg-green-500 transition-all duration-300 z-50" id="uploadProgressBar" style="width: 0%"></div>`);
            }
            try {
                uploadedImageUrl = await uploadMediaWithProgress(selectedImageFile, token, (percent) => {
                    btn.innerText = `Đang tải lên ${percent}%...`;
                    document.getElementById("uploadProgressBar").style.width = percent + "%";
                });
            } catch (uploadErr) {
                alert("Tải file thất bại: " + uploadErr);
                btn.innerText = "Đăng bài"; btn.disabled = false; return;
            }
        }

        btn.innerText = "Đang lưu bài viết...";
        const postRes = await fetch(`${BASE_URL}/api/post`, {
            method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ content: content, imageUrl: uploadedImageUrl })
        });

        if (postRes.ok) {
            document.getElementById("postContent").value = "";
            removeImage();
            loadNewsfeed(token, true); 
        } else { alert("Lỗi khi lưu bài!"); }
    } catch (error) { alert("Mất kết nối!"); } 
    finally { btn.innerText = "Đăng bài"; btn.disabled = false; }
}

function loadNewsfeed(token, isInitialLoad = false) {
    if (isInitialLoad) { currentPage = 1; hasMorePosts = true; const container = document.getElementById("newsfeedContainer"); if (container) container.innerHTML = ""; }
    if (!hasMorePosts) return;
    isFetching = true;
    const container = document.getElementById("newsfeedContainer");
    if (!container) return;
    const loadingId = `loading-page-${currentPage}`;
    container.insertAdjacentHTML('beforeend', `<div id="${loadingId}" class="text-center text-themeSub py-6"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>`);

    fetch(`${BASE_URL}/api/post?page=${currentPage}&pageSize=10`, { method: "GET", headers: { "Authorization": "Bearer " + token } })
    .then(res => { if (!res.ok) throw new Error("Lỗi API GetNewsfeed"); return res.json(); })
    .then(posts => {
        const spinner = document.getElementById(loadingId);
        if (spinner) spinner.remove();

        if (posts.length === 0 && isInitialLoad) {
            container.innerHTML = `<div class="bg-themePanel rounded-xl p-8 text-center text-themeSub shadow-sm border border-themeBorder">Bảng tin trống. Hãy đăng bài hoặc follow bạn bè!</div>`;
            isFetching = false; return;
        }

        if (posts.length < 10) hasMorePosts = false;

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
                            <div class="font-bold text-themeText text-sm flex items-center gap-2 mb-2">
                                <i class="fa-solid fa-share text-primary"></i> ${getSafeAvatar(post.originalPost.authorAvatar, post.originalPost.authorName, "w-6 h-6", "text-[10px]")} Đã chia sẻ từ: ${post.originalPost.authorName}
                            </div>
                            <div class="text-[11px] text-themeSub mb-2">${new Date(post.originalPost.createdAt).toLocaleString()}</div>
                            <div class="text-themeText text-sm whitespace-pre-wrap">${formatMentions(post.originalPost.content)}</div>
                            ${origImgHtml}
                        </div>`;
                }
            }

            const timeStr = new Date(post.createdAt).toLocaleString();
            let privacyIcon = '<i class="fa-solid fa-earth-americas ml-2"></i>';
            if (post.privacy === 1) privacyIcon = '<i class="fa-solid fa-user-group ml-2"></i>';
            if (post.privacy === 2) privacyIcon = '<i class="fa-solid fa-lock ml-2"></i>';

            let reactUI = { icon: `<i class="fa-solid fa-thumbs-up"></i>`, text: "Thích", color: "text-themeSub" };
            if (post.userReaction && REACTION_CONFIG[post.userReaction]) { reactUI = REACTION_CONFIG[post.userReaction]; reactUI.color += " font-bold"; }

            // Nút gỡ thẻ nếu bài viết này có tag tên mình
            let untagBtn = '';
            if(MY_GLOBAL_PROFILE_DATA && post.content.includes(`@[${MY_GLOBAL_PROFILE_DATA.username}](${MY_GLOBAL_PROFILE_DATA.id})`)) {
                untagBtn = `<button onclick="untagPost('${post.id}')" class="text-themeSub hover:text-orange-500 transition ml-2" title="Gỡ thẻ tên tôi"><i class="fa-solid fa-user-minus text-xl"></i></button>`;
            }

            const postCard = `
                <div id="post-${post.id}" class="bg-themePanel rounded-xl shadow-sm border border-themeBorder overflow-hidden transition-colors relative mb-4">
                    <div class="absolute top-4 right-4 flex gap-4 z-10">
                        <button onclick="toggleSavePost('${post.id}', this)" class="text-themeSub hover:text-primary transition" title="Lưu / Bỏ lưu"><i class="${post.isSaved ? 'fa-solid text-primary' : 'fa-regular'} fa-bookmark text-xl"></i></button>
                        <button onclick="submitReport('Post', '${post.id}')" class="text-themeSub hover:text-red-500 transition" title="Báo cáo"><i class="fa-solid fa-flag text-xl"></i></button>
                        ${untagBtn}
                    </div>

                    <div class="p-4 pb-2 flex items-center gap-3 cursor-pointer pr-32" onclick="location.href='profile.html?id=${post.userId}'">
                        ${getSafeAvatar(post.authorAvatar, post.authorName, "w-10 h-10")}
                        <div>
                            <div class="font-bold text-themeText hover:underline">${post.authorName}</div>
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
        isFetching = false;
    })
    .catch(err => { console.error(err); isFetching = false; });
}

async function untagPost(postId) {
    if(!confirm("Bạn có chắc chắn muốn gỡ thẻ tên mình khỏi bài viết này?")) return;
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/post/${postId}/untag`, { method: "POST", headers: { "Authorization": "Bearer " + token } });
        if(res.ok) { alert("Đã gỡ thẻ thành công!"); loadNewsfeed(token, true); }
        else { const txt = await res.text(); alert(txt); }
    } catch (e) { console.error(e); }
}

async function submitReport(targetType, targetId) {
    const reason = prompt(`Nhập lý do báo cáo:`); if (!reason || !reason.trim()) return;
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/report`, { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ targetType, targetId, reason: reason.trim() }) });
        const data = await res.json(); alert(data.message || "Đã báo cáo!");
    } catch (e) { alert("Lỗi kết nối khi gửi báo cáo."); }
}

async function toggleSavePost(postId, btnElement) {
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/post/${postId}/save`, { method: "POST", headers: { "Authorization": "Bearer " + token } });
        if (res.ok) {
            const data = await res.json();
            const icon = btnElement.querySelector('i');
            if (data.isSaved) { icon.className = 'fa-solid fa-bookmark text-primary text-xl'; alert("📌 " + data.message); } 
            else { icon.className = 'fa-regular fa-bookmark text-xl'; }
        }
    } catch (e) { console.error(e); }
}

function sharePostPrompt(originalPostId) {
    if (!originalPostId) { alert("Không thể chia sẻ bài viết đã bị xóa."); return; }
    const caption = prompt("Nhập cảm nghĩ của bạn về bài viết này (có thể để trống):"); if (caption === null) return; 
    const token = localStorage.getItem("jwtToken");
    fetch(`${BASE_URL}/api/post/${originalPostId}/share`, { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ content: caption }) })
    .then(res => res.json()).then(data => { alert(data.message); loadNewsfeed(token, true); });
}

function toggleCommentSection(postId) {
    const section = document.getElementById(`comment-section-${postId}`);
    if (section) { section.classList.toggle("hidden"); if (!section.classList.contains("hidden")) loadComments(postId); }
}

function loadComments(postId) {
    const token = localStorage.getItem("jwtToken");
    const container = document.getElementById(`comment-list-${postId}`); if (!container) return;

    fetch(`${BASE_URL}/api/post/${postId}/comments`, { headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json()).then(comments => {
        container.innerHTML = "";
        if (comments.length === 0) { container.innerHTML = `<div class="text-xs text-themeSub italic">Chưa có bình luận nào. Hãy là người đầu tiên!</div>`; return; }
        comments.forEach(c => {
            const timeStr = new Date(c.createdAt).toLocaleString('vi-VN');
            container.innerHTML += `
                <div class="flex gap-2">
                    <div class="cursor-pointer" onclick="location.href='profile.html?id=${c.userId}'">
                        ${getSafeAvatar(c.authorAvatar, c.authorName, "w-8 h-8", "text-[10px]")}
                    </div>
                    <div class="bg-themePanel p-2.5 rounded-2xl rounded-tl-none border border-themeBorder flex-1 shadow-sm">
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-bold text-themeText text-xs cursor-pointer hover:underline" onclick="location.href='profile.html?id=${c.userId}'">${c.authorName}</span>
                            <span class="text-[10px] text-themeSub">${timeStr}</span>
                        </div>
                        <div class="text-themeText text-sm whitespace-pre-wrap">${formatMentions(c.content)}</div>
                    </div>
                </div>`;
        });
    });
}

async function submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input ? input.value.trim() : ""; if (!content) return;
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL}/api/post/${postId}/comment`, { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ content: content }) });
        if (res.ok) { input.value = ""; loadComments(postId); const countElem = document.querySelector(`#post-${postId} button:nth-child(2)`); if (countElem) countElem.innerHTML = `<i class="fa-solid fa-comment mr-1"></i> Bình luận`; }
    } catch (e) { console.error(e); }
}

// STORY FUNCTIONS
function handleStoryUpload(event) {
    const file = event.target.files[0]; if (!file) return;
    if (file.type.startsWith("video/")) {
        const videoNode = document.createElement("video"); videoNode.preload = "metadata"; videoNode.src = URL.createObjectURL(file);
        videoNode.onloadedmetadata = function() {
            URL.revokeObjectURL(videoNode.src); 
            if (videoNode.duration > 60) { alert("🚫 Rất tiếc, Story chỉ cho phép đăng video dài tối đa 60 giây (1 phút)!"); document.getElementById("storyUploadInput").value = ""; return; }
            executeStoryUpload(file);
        };
    } else { executeStoryUpload(file); }
}

async function executeStoryUpload(file) {
    const token = localStorage.getItem("jwtToken");
    document.getElementById("storyUploadInput").value = "";
    const createStoryCard = document.querySelector("#storyContainer > div:first-child");
    const originalHtml = createStoryCard.innerHTML;
    createStoryCard.innerHTML = `<div class="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white"><i class="fa-solid fa-spinner fa-spin text-3xl mb-2 text-primary"></i><span id="storyProgressText" class="text-sm font-bold text-green-400">0%</span></div>`;

    try {
        const uploadedUrl = await uploadMediaWithProgress(file, token, (percent) => { const pt = document.getElementById("storyProgressText"); if (pt) pt.innerText = percent + "%"; });
        const storyRes = await fetch(`${BASE_URL}/api/story`, { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: uploadedUrl }) });
        if (storyRes.ok) loadStories(token);
    } catch (e) { alert("Lỗi đăng Story: " + e); } 
    finally { createStoryCard.innerHTML = originalHtml; loadStories(token); }
}

function loadStories(token) {
    fetch(`${BASE_URL}/api/story/feed`, { headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json()).then(data => {
        currentStoryList = data;
        const container = document.getElementById("friendsStoryList"); if (!container) return; container.innerHTML = "";
        data.forEach((group, index) => {
            const ringColor = group.isSeen ? "border-gray-400" : "border-primary";
            const fullImgUrl = group.img.startsWith('http') ? group.img : BASE_URL + group.img;
            const isVideo = fullImgUrl.match(/\.(mp4|webm|mov|ogg|m4v)/i);
            const mediaTag = isVideo ? `<video src="${fullImgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300"></video>` : `<img src="${fullImgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">`;
            container.innerHTML += `<div onclick="openStoryViewer(${index})" class="relative w-28 h-48 rounded-xl bg-gray-800 flex-shrink-0 cursor-pointer hover:opacity-90 transition overflow-hidden group shadow-sm">${mediaTag}<div class="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60"></div><div class="absolute top-3 left-3">${getSafeAvatar(group.avatar, group.name, "w-10 h-10", "text-sm border-4 " + ringColor)}</div><div class="absolute bottom-2 left-2 right-2 text-white text-[11px] font-bold truncate drop-shadow-md">${group.name}</div></div>`;
        });
    });
}

function openStoryViewer(userIndex) {
    if (currentStoryList.length === 0) return;
    activeUserIndex = userIndex; activeStoryIndex = 0;
    const modal = document.getElementById("storyViewerModal");
    if(modal) { modal.classList.remove("hidden"); modal.classList.add("flex"); }
    document.body.style.overflow = "hidden"; showCurrentStory();
}

function showCurrentStory() {
    clearTimeout(storyTimer);
    if (activeStoryIndex >= currentStoryList[activeUserIndex].stories.length) { activeUserIndex++; activeStoryIndex = 0; }
    if (activeUserIndex >= currentStoryList.length) { closeStoryViewer(); return; }

    const userGroup = currentStoryList[activeUserIndex];
    const story = userGroup.stories[activeStoryIndex];
    const fullImgUrl = story.imageUrl.startsWith('http') ? story.imageUrl : BASE_URL + story.imageUrl;
    const isVideo = fullImgUrl.match(/\.(mp4|webm|mov|ogg|m4v)/i);
    const imgEl = document.getElementById("storyViewerImage"); const vidEl = document.getElementById("storyViewerVideo");

    const playStoryUI = (durationMs) => {
        const progressContainer = document.getElementById("storyProgressBarContainer"); progressContainer.innerHTML = "";
        userGroup.stories.forEach((_, idx) => {
            let bgClass = "bg-gray-500/50"; if (idx < activeStoryIndex) bgClass = "bg-white";
            let innerBar = ""; if (idx === activeStoryIndex) innerBar = `<div class="h-full bg-white" style="animation: progress_linear_forwards ${durationMs}ms linear forwards;"></div>`;
            progressContainer.innerHTML += `<div class="flex-1 h-1 rounded-full overflow-hidden ${bgClass}">${innerBar}</div>`;
        });
        document.getElementById("storyViewerName").innerText = userGroup.name;
        document.getElementById("storyViewerTime").innerText = new Date(story.createdAt).toLocaleTimeString('vi-VN');
        document.getElementById("storyViewerAvatar").innerHTML = getSafeAvatar(userGroup.avatar, userGroup.name, "w-full h-full text-xs border-0");
        if (!story.isSeen) { const token = localStorage.getItem("jwtToken"); fetch(`${BASE_URL}/api/story/${story.id}/view`, { method: "POST", headers: { "Authorization": "Bearer " + token } }); story.isSeen = true; }
        storyTimer = setTimeout(() => { activeStoryIndex++; showCurrentStory(); }, durationMs);
    };

    if (isVideo) { imgEl.classList.add("hidden"); vidEl.classList.remove("hidden"); vidEl.src = fullImgUrl; vidEl.muted = false; vidEl.onloadedmetadata = function() { playStoryUI(vidEl.duration * 1000); vidEl.play(); }; } 
    else { vidEl.classList.add("hidden"); vidEl.pause(); imgEl.classList.remove("hidden"); imgEl.src = fullImgUrl; playStoryUI(4000); }
}

function closeStoryViewer() {
    clearTimeout(storyTimer); const vidEl = document.getElementById("storyViewerVideo"); if(vidEl) vidEl.pause();
    const modal = document.getElementById("storyViewerModal"); if(modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); }
    document.body.style.overflow = "auto"; loadStories(localStorage.getItem("jwtToken"));
}
function nextStory() { activeStoryIndex++; showCurrentStory(); }
function prevStory() { activeStoryIndex--; if (activeStoryIndex < 0) { activeUserIndex--; if (activeUserIndex < 0) { activeUserIndex = 0; activeStoryIndex = 0; } else { activeStoryIndex = currentStoryList[activeUserIndex].stories.length - 1; } } showCurrentStory(); }