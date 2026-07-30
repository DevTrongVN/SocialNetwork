using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Application.DTOs
{
    public class EditPostRequest
    {
        public string Content { get; set; } = string.Empty;
        public int Privacy { get; set; } // Hỗ trợ đổi luôn quyền riêng tư
    }
}