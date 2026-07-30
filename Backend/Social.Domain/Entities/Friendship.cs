using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class Friendship
    {
        // ID người gửi lời mời
        public Guid RequesterId { get; set; }

        // ID người nhận lời mời
        public Guid ReceiverId { get; set; }

        // Trạng thái: 0 = Đang chờ duyệt (Pending), 1 = Đã là bạn bè (Accepted)
        public int Status { get; set; } = 0;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}