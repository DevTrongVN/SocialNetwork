using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class User
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string? FullName { get; set; }
        public string? AvatarUrl { get; set; }

        public string? CoverUrl { get; set; }
        public string? Bio { get; set; }

        public bool IsOnline { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string Role { get; set; } = "User";

        public int ProfileVisibility { get; set; } = 0;
        public int FriendListVisibility { get; set; } = 0;
        public int FollowerVisibility { get; set; } = 0;
        public int PostDefaultVisibility { get; set; } = 0;
        public int EmailVisibility { get; set; } = 2;
        public int PhoneVisibility { get; set; } = 2;

        public bool IsDeleted { get; set; } = false;

        public DateTime? DeletedAt { get; set; } 
        public DateTime? UpdatedAt { get; set; }

        // --- BỘ 3 THUỘC TÍNH BẮT BỘC CHO OTP & QUÊN MẬT KHẨU ---
        public bool IsEmailVerified { get; set; } = false;
        public string? OtpCode { get; set; }
        public DateTime? OtpExpiry { get; set; }
    }
}