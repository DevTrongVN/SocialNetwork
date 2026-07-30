using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Application.DTOs
{
    public class CreateCommentRequest
    {
        public string Content { get; set; } = string.Empty;
        public Guid? ParentCommentId { get; set; }
    }
}