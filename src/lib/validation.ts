/**
 * Input validation utilities for security
 */

// Sanitize HTML to prevent XSS attacks
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Validate and sanitize time block input
export function validateTimeBlock(data: {
  title: string;
  notes?: string;
  tags?: string;
  duration?: number;
  startMinutes?: number;
}) {
  const errors: string[] = [];

  // Title validation
  if (!data.title || data.title.trim().length === 0) {
    errors.push('Title is required');
  } else if (data.title.length > 200) {
    errors.push('Title must be less than 200 characters');
  }

  // Duration validation
  if (data.duration !== undefined) {
    if (data.duration < 5 || data.duration > 480) {
      errors.push('Duration must be between 5 minutes and 8 hours');
    }
  }

  // Start time validation
  if (data.startMinutes !== undefined) {
    if (data.startMinutes < 0 || data.startMinutes >= 1440) {
      errors.push('Invalid start time');
    }
  }

  // Tags validation
  if (data.tags) {
    const tagArray = data.tags.split(',').map(t => t.trim());
    if (tagArray.length > 10) {
      errors.push('Maximum 10 tags allowed');
    }
    if (tagArray.some(tag => tag.length > 50)) {
      errors.push('Each tag must be less than 50 characters');
    }
  }

  // Notes validation
  if (data.notes && data.notes.length > 10000) {
    errors.push('Notes must be less than 10,000 characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      ...data,
      title: sanitizeHtml(data.title || ''),
      notes: data.notes ? sanitizeHtml(data.notes) : undefined,
      tags: data.tags ? sanitizeHtml(data.tags) : undefined,
    }
  };
}

// Validate priority input
export function validatePriority(content: string): {
  isValid: boolean;
  error?: string;
  sanitized: string;
} {
  if (content.length > 500) {
    return {
      isValid: false,
      error: 'Priority must be less than 500 characters',
      sanitized: ''
    };
  }

  return {
    isValid: true,
    sanitized: sanitizeHtml(content)
  };
}

// Validate canvas text input
export function validateCanvasText(content: string): {
  isValid: boolean;
  error?: string;
  sanitized: string;
} {
  if (content.length > 1000) {
    return {
      isValid: false,
      error: 'Canvas text must be less than 1000 characters',
      sanitized: ''
    };
  }

  return {
    isValid: true,
    sanitized: sanitizeHtml(content)
  };
}

// Validate file upload
export function validateFileUpload(file: File): {
  isValid: boolean;
  error?: string;
} {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  if (file.size > maxSize) {
    return {
      isValid: false,
      error: 'File size must be less than 10MB'
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: 'Only JPEG, PNG, GIF, and WebP images are allowed'
    };
  }

  return { isValid: true };
}

// Validate date input
export function validateDate(dateStr: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return false;
  }
  
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

// Rate limiting helper
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  
  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    
    // Remove old attempts outside the window
    const validAttempts = attempts.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    if (validAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    validAttempts.push(now);
    this.attempts.set(key, validAttempts);
    return true;
  }
  
  reset(key: string): void {
    this.attempts.delete(key);
  }
}