using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class Message
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        // ID của người gửi
        public Guid SenderId { get; set; }

        public Guid? GroupId { get; set; }

        // Lưu kèm Username để lúc hiện thị ở Frontend đỡ phải kết nối bảng tìm kiếm
        public string SenderUsername { get; set; } = string.Empty;
        // ID của người nhận
        public Guid? ReceiverId { get; set; }

        // Nội dung tin nhắn (Sau này chính là cục chuỗi đã mã hóa E2EE)
        public string Content { get; set; } = string.Empty;

        public bool IsEdited { get; set; } = false;
        public bool IsRecalled { get; set; } = false;
        public bool IsRead { get; set; } = false;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // ==========================================
        // 🔥 CÁC CỘT MỚI CHO TÍNH NĂNG CHAT NÂNG CAO
        // ==========================================

        // Lưu ID của tin nhắn gốc nếu đây là tin nhắn Trả lời (Reply)
        public Guid? ReplyToId { get; set; }

        // Chuỗi lưu danh sách ID những người đã bấm "Xóa phía tôi" (Cách nhau bằng dấu phẩy)
        public string DeletedForIds { get; set; } = string.Empty;
    }
}