// js/theme.js
function initTheme() {
    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
        const icon = document.getElementById("themeIcon");
        if(icon) icon.classList.replace("fa-moon", "fa-sun");
    }
}

function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById("themeIcon");
    body.classList.toggle("dark");
    
    if (body.classList.contains("dark")) {
        if(icon) icon.classList.replace("fa-moon", "fa-sun");
        localStorage.setItem("theme", "dark");
    } else {
        if(icon) icon.classList.replace("fa-sun", "fa-moon");
        localStorage.setItem("theme", "light");
    }
}

// Chạy ngay khi file được nạp
initTheme();