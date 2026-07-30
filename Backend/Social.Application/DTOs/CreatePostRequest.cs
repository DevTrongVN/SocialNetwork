using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Application.DTOs
{
    public class CreatePostRequest
    {
        public string Content { get; set; } = string.Empty;

        // Dấu ? nghĩa là có thể null (bài viết có thể không có ảnh)
        public string? ImageUrl { get; set; }
        public int? Privacy { get; set; }
        public int? CommentPermission { get; set; } // 0: Tất cả, 1: Chỉ bạn bè, 2: Tắt bình luận
    }
}
