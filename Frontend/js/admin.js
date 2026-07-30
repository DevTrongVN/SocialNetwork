const BASE_URL_ADMIN = "";

window.onload = function() {
    const token = localStorage.getItem("jwtToken");
    if (!token) { window.location.href = "index.html"; return; }
    loadPendingReports();
};

// 1. CHEAT CODE: GỌI API ĐỂ BIẾN MÌNH THÀNH ADMIN (DÙNG ĐỂ TEST)
async function hackToAdmin() {
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL_ADMIN}/api/admin/make-me-admin`, {
            method: "POST", headers: { "Authorization": "Bearer " + token }
        });
        if (res.ok) {
            const data = await res.json();
            alert("🔥 " + data.message + "\nHãy F5 lại trang để hệ thống nhận diện!");
            window.location.reload();
        } else { alert("Lỗi khi hack quyền!"); }
    } catch (e) { console.error(e); }
}

// 2. TẢI DANH SÁCH BÁO CÁO
async function loadPendingReports() {
    const token = localStorage.getItem("jwtToken");
    try {
        const res = await fetch(`${BASE_URL_ADMIN}/api/admin/reports`, {
            headers: { "Authorization": "Bearer " + token }
        });
        
        const tbody = document.getElementById("reportTableBody");
        
        // Nếu không phải Admin thì sẽ bị Backend từ chối 403
        if (res.status === 403) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500 font-bold"><i class="fa-solid fa-ban text-4xl mb-3 block"></i>BẠN KHÔNG CÓ QUYỀN TRUY CẬP TRANG NÀY! BẤM NÚT KÍCH HOẠT QUYỀN ADMIN Ở GÓC TRÊN ĐỂ TEST.</td></tr>`;
            return;
        }

        if (res.ok) {
            const reports = await res.json();
            tbody.innerHTML = "";
            
            if (reports.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-[#b0b3b8] italic"><i class="fa-solid fa-check-circle text-green-500 text-3xl mb-2 block"></i>Tuyệt vời! Không có báo cáo nào cần xử lý.</td></tr>`;
                return;
            }

            reports.forEach(r => {
                const timeStr = new Date(r.createdAt).toLocaleString('vi-VN');
                const targetLabel = r.targetType === 'Post' ? '<span class="px-2 py-1 bg-blue-900 text-blue-300 rounded text-xs font-bold">Bài Viết</span>' : '<span class="px-2 py-1 bg-purple-900 text-purple-300 rounded text-xs font-bold">Người Dùng</span>';
                
                // Nút hành động thay đổi tùy theo việc report Bài hay Người
                let actionBtn = '';
                if (r.targetType === 'Post') {
                    actionBtn = `<button onclick="deletePost('${r.targetId}', '${r.id}')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded shadow-sm text-xs transition"><i class="fa-solid fa-trash-can mr-1"></i> Xóa Bài Này</button>`;
                } else {
                    actionBtn = `<button onclick="banUser('${r.targetId}', '${r.id}')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded shadow-sm text-xs transition"><i class="fa-solid fa-user-slash mr-1"></i> Khóa Tài Khoản</button>`;
                }

                tbody.innerHTML += `
                    <tr class="hover:bg-[#3a3b3c] transition">
                        <td class="p-4 whitespace-nowrap text-sm text-[#b0b3b8]">${timeStr}</td>
                        <td class="p-4 font-bold text-blue-400">${r.reporterName}</td>
                        <td class="p-4">${targetLabel}</td>
                        <td class="p-4 text-sm text-[#e4e6eb] max-w-xs truncate" title="${r.reason}">${r.reason}</td>
                        <td class="p-4 text-center space-x-2">
                            ${actionBtn}
                            <button onclick="resolveReport('${r.id}')" class="bg-[#4e4f50] hover:bg-[#5e5f60] text-white font-bold py-1.5 px-3 rounded shadow-sm text-xs transition"><i class="fa-solid fa-check mr-1"></i> Bỏ Qua (An Toàn)</button>
                        </td>
                    </tr>`;
            });
        }
    } catch (e) { console.error(e); }
}

// 3. CÁC HÀM THỰC THI PHÁN QUYẾT
async function resolveReport(reportId) {
    if(!confirm("Bỏ qua báo cáo này?")) return;
    const token = localStorage.getItem("jwtToken");
    await fetch(`${BASE_URL_ADMIN}/api/admin/report/${reportId}/resolve`, { method: "PUT", headers: { "Authorization": "Bearer " + token } });
    loadPendingReports(); // Tải lại bảng
}

async function deletePost(postId, reportId) {
    if(!confirm("Bạn có chắc chắn muốn XÓA VĨNH VIỄN bài viết này khỏi hệ thống?")) return;
    const token = localStorage.getItem("jwtToken");
    await fetch(`${BASE_URL_ADMIN}/api/admin/post/${postId}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
    await fetch(`${BASE_URL_ADMIN}/api/admin/report/${reportId}/resolve`, { method: "PUT", headers: { "Authorization": "Bearer " + token } });
    alert("Đã xóa bài viết thành công!");
    loadPendingReports();
}

async function banUser(userId, reportId) {
    if(!confirm("CẢNH BÁO: Khóa tài khoản này sẽ khiến họ không thể đăng nhập được nữa! Xác nhận?")) return;
    const token = localStorage.getItem("jwtToken");
    const res = await fetch(`${BASE_URL_ADMIN}/api/admin/user/${userId}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
    if(res.ok) {
        await fetch(`${BASE_URL_ADMIN}/api/admin/report/${reportId}/resolve`, { method: "PUT", headers: { "Authorization": "Bearer " + token } });
        alert("Đã khóa tài khoản thành công!");
        loadPendingReports();
    } else {
        const error = await res.text();
        alert("Lỗi: " + error);
    }
}