const API_URL = "/api/auth";

let tempEmail = ""; // Biến bí mật để nhớ Email người dùng đang thao tác

function showError(message) {
    const errorDiv = document.getElementById("errorMsg");
    errorDiv.innerText = message;
    errorDiv.classList.remove("hidden");
    setTimeout(() => { errorDiv.classList.add("hidden"); }, 5000);
}

// Ẩn tất cả các form để dọn đường
function hideAllForms() {
    document.getElementById("errorMsg").classList.add("hidden");
    ["loginBox", "registerBox", "otpBox", "forgotBox", "resetBox"].forEach(id => {
        document.getElementById(id).classList.add("hidden");
    });
}

// Các hàm kích hoạt từng Form
function showLoginForm() { hideAllForms(); document.getElementById("loginBox").classList.remove("hidden"); }
function showRegisterForm() { hideAllForms(); document.getElementById("registerBox").classList.remove("hidden"); }
function showForgotForm() { hideAllForms(); document.getElementById("forgotBox").classList.remove("hidden"); }

// 1. ĐĂNG NHẬP
async function login() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const btn = document.getElementById("loginBtn");

    if (!email || !password) { showError("Vui lòng nhập đầy đủ Email và Mật khẩu!"); return; }

    btn.innerText = "Đang kết nối..."; btn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem("jwtToken", data.token);
            window.location.href = "feed.html"; 
        } else {
            const errData = await response.text();
            showError(errData);
            // Nếu phát hiện lỗi là do chưa kích hoạt OTP, tự động lật sang màn hình OTP luôn
            if (errData.includes("chưa được xác thực")) {
                tempEmail = email; // Ghi nhớ email này
                hideAllForms(); 
                document.getElementById("otpBox").classList.remove("hidden");
            }
        }
    } catch (error) { showError("Lỗi kết nối máy chủ Backend!"); }
    finally { btn.innerText = "Đăng Nhập"; btn.disabled = false; }
}

// 2. ĐĂNG KÝ
async function register() {
    const username = document.getElementById("regUsername").value;
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;
    const btn = document.getElementById("regBtn");

    if (!username || !email || !password) { showError("Vui lòng điền đủ thông tin!"); return; }

    btn.innerText = "Đang gửi mã OTP..."; btn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password })
        });
        if (response.ok) {
            tempEmail = email; // Nhớ email để chuyển qua ô OTP xác nhận
            alert("Đã gửi mã OTP! Vui lòng kiểm tra Email (Cả mục Thư rác/Spam).");
            hideAllForms(); document.getElementById("otpBox").classList.remove("hidden");
        } else { showError(await response.text()); }
    } catch (error) { showError("Lỗi kết nối máy chủ!"); }
    finally { btn.innerText = "Đăng Ký Mới"; btn.disabled = false; }
}

// 3. XÁC NHẬN OTP
async function verifyOtp() {
    const otpCode = document.getElementById("otpCode").value;
    const btn = document.getElementById("verifyOtpBtn");
    
    if (!otpCode) { showError("Vui lòng nhập mã OTP!"); return; }

    btn.innerText = "Đang kiểm tra..."; btn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/verify-otp`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: tempEmail, otpCode })
        });
        if (response.ok) {
            alert("Xác thực Email thành công! Bạn đã có thể đăng nhập.");
            document.getElementById("loginEmail").value = tempEmail;
            document.getElementById("loginPassword").value = "";
            showLoginForm(); // Đá ngược về màn hình đăng nhập
        } else { showError(await response.text()); }
    } catch (error) { showError("Lỗi kết nối máy chủ!"); }
    finally { btn.innerText = "Xác Nhận OTP"; btn.disabled = false; }
}

// 4. QUÊN MẬT KHẨU (GỬI EMAIL)
async function sendForgotOtp() {
    const email = document.getElementById("forgotEmail").value;
    const btn = document.getElementById("forgotBtn");
    
    if (!email) { showError("Vui lòng nhập Email!"); return; }

    btn.innerText = "Đang gửi mã..."; btn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/forgot-password`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        if (response.ok) {
            tempEmail = email; // Nhớ email để đổi pass
            alert("Đã gửi mã khôi phục tới Email của bạn!");
            hideAllForms(); document.getElementById("resetBox").classList.remove("hidden");
        } else { showError(await response.text()); }
    } catch (error) { showError("Lỗi kết nối máy chủ!"); }
    finally { btn.innerText = "Gửi mã khôi phục"; btn.disabled = false; }
}

// 5. ĐẶT LẠI MẬT KHẨU
async function resetPassword() {
    const otpCode = document.getElementById("resetOtpCode").value;
    const newPassword = document.getElementById("resetNewPassword").value;
    const btn = document.getElementById("resetBtn");
    
    if (!otpCode || !newPassword) { showError("Vui lòng điền đủ thông tin!"); return; }

    btn.innerText = "Đang xử lý..."; btn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/reset-password`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: tempEmail, otpCode, newPassword })
        });
        if (response.ok) {
            alert("Đổi mật khẩu thành công! Hãy đăng nhập lại bằng Mật khẩu mới.");
            document.getElementById("loginEmail").value = tempEmail;
            document.getElementById("loginPassword").value = "";
            showLoginForm();
        } else { showError(await response.text()); }
    } catch (error) { showError("Lỗi kết nối máy chủ!"); }
    finally { btn.innerText = "Cập Nhật Mật Khẩu"; btn.disabled = false; }
}