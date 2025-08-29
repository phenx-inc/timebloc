'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Moon, Sun, ChevronLeft, ChevronRight, Target, Settings } from 'lucide-react';
import { validateTimeBlock, validatePriority, validateCanvasText, validateFileUpload, validateDate } from '@/lib/validation';

interface TimeBlock {
  id?: number;
  date: string;
  start_minutes: number;
  duration_minutes: number;
  title: string;
  notes_file?: string;
  color: string;
  tags: string[];
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  description?: string;
  location?: string;
  provider: string;
}

export default function Home() {
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [priorities, setPriorities] = useState<string[]>(['', '', '', '', '']);
  const [darkMode, setDarkMode] = useState(false);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [modalColor, setModalColor] = useState('#3b82f6');
  const [modalTags, setModalTags] = useState('');
  const [selectedStartMinutes, setSelectedStartMinutes] = useState(0);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(30);

  // Refs for scrolling
  const timeGridRef = useRef<HTMLDivElement>(null);

  // Resizable layout state
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const [prioritiesHeight, setPrioritiesHeight] = useState(160);
  const [isResizingVertical, setIsResizingVertical] = useState(false);
  
  // Canvas items state
  const [canvasItems, setCanvasItems] = useState<Array<{
    id: string;
    type: 'text' | 'image';
    x: number;
    y: number;
    width?: number;
    height?: number;
    content?: string;
    url?: string;
    name?: string;
    isEditing?: boolean;
  }>>([]);
  const [hasEverHadContent, setHasEverHadContent] = useState(false);
  
  // Calendar state
  const [calendarConnections, setCalendarConnections] = useState<Array<{
    id: string;
    provider: string;
    email: string;
    connectedAt: number;
  }>>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [pendingProvider, setPendingProvider] = useState<string>('');
  
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mouseDownTime, setMouseDownTime] = useState<number | null>(null);

  // Debounce timers
  const [brainDumpTimer] = useState<NodeJS.Timeout | null>(null);
  const [priorityTimers, setPriorityTimers] = useState<NodeJS.Timeout[]>([]);

  const loadDayData = useCallback(async () => {
    try {
      // Dynamically import Tauri APIs
      const { invoke } = await import('@tauri-apps/api/tauri');
      
      const blocks = await invoke('get_time_blocks', { date: currentDate });
      setTimeBlocks(blocks as TimeBlock[]);
      
      // Load calendar events for the current date
      try {
        const { calendarService } = await import('../lib/calendar-service');
        const startDate = new Date(currentDate + 'T00:00:00');
        const endDate = new Date(currentDate + 'T23:59:59');
        const events = await calendarService.getAllCalendarEvents(startDate, endDate);
        setCalendarEvents(events);
      } catch (error) {
        console.warn('Failed to load calendar events:', error);
        setCalendarEvents([]);
      }
      
      // Load canvas data from brain dump
      const brainDump = await invoke('get_brain_dump', { date: currentDate });
      const brainDumpStr = (brainDump as string) || '';
      
      // Try to parse as canvas data, fallback to regular text
      try {
        const canvasData = JSON.parse(brainDumpStr);
        if (canvasData.items && Array.isArray(canvasData.items)) {
          // Load canvas items and restore image URLs for display
          const itemsWithUrls = await Promise.all(
            canvasData.items.map(async (item: { type: string; name?: string; [key: string]: unknown }) => {
              if (item.type === 'image' && item.name) {
                try {
                  // Try to load the image from attachments
                  const filePath = `attachments/${currentDate}/0_${item.name}`;
                  const imageData = await invoke('load_attachment', { filePath });
                  if (imageData) {
                    const blob = new Blob([new Uint8Array(imageData as number[])], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    return { ...item, url };
                  }
                } catch {
                  console.warn('Failed to load image:', item.name);
                }
              }
              return item;
            })
          );
          setCanvasItems(itemsWithUrls.filter(Boolean));
          setHasEverHadContent(itemsWithUrls.length > 0);
          // Clear old text content
        } else {
          // Legacy text content - just clear canvas items
          setCanvasItems([]);
          setHasEverHadContent(false);
        }
      } catch {
        // Not JSON, treat as legacy text content - just clear canvas items
        setCanvasItems([]);
        setHasEverHadContent(false);
      }
      
      // Load priorities from localStorage for now
      if (typeof window !== 'undefined') {
        const prioritiesKey = `priorities_${currentDate}`;
        const savedPriorities = localStorage.getItem(prioritiesKey);
        if (savedPriorities) {
          setPriorities(JSON.parse(savedPriorities));
        } else {
          setPriorities(['', '', '', '', '']);
        }
      }
    } catch (error) {
      console.error('Failed to load day data:', error);
    }
  }, [currentDate]);

  useEffect(() => {
    // Only run in browser environment
    if (typeof window !== 'undefined') {
      loadDayData();
      // Apply dark mode on mount
      const savedDarkMode = localStorage.getItem('darkMode') === 'true';
      setDarkMode(savedDarkMode);
      document.documentElement.classList.toggle('dark', savedDarkMode);
      
      // Initialize calendar service to check for redirect results
      const initCalendarService = async () => {
        try {
          const { calendarService } = await import('../lib/calendar-service');
          await calendarService.initialize();
          console.log('🔥 Calendar service initialized on app load');
          // Refresh connections in case we got one from redirect
          await loadCalendarConnections();
        } catch (error) {
          console.warn('Failed to initialize calendar service on load:', error);
        }
      };
      initCalendarService();
    }
  }, [currentDate, loadDayData]);

  // Auto-scroll to 6AM on load
  useEffect(() => {
    if (timeGridRef.current) {
      // Each hour row is approximately 36px (h-9), 6AM is the 6th row (0-indexed), so 6 * 36 = 216px
      const scrollTo = 6 * 36; // 6AM position
      setTimeout(() => {
        timeGridRef.current?.scrollTo({ top: scrollTo, behavior: 'smooth' });
      }, 100);
    }
  }, [currentDate]);

  // Track when content is added
  useEffect(() => {
    const hasContent = canvasItems.some(item => 
      item.type === 'image' || (item.type === 'text' && item.content && item.content.trim())
    );
    if (hasContent) {
      setHasEverHadContent(true);
    }
  }, [canvasItems]);

  const savePriorities = useCallback(async () => {
    try {
      if (typeof window !== 'undefined') {
        const prioritiesKey = `priorities_${currentDate}`;
        localStorage.setItem(prioritiesKey, JSON.stringify(priorities));
      }
    } catch (error) {
      console.error('Failed to save priorities:', error);
    }
  }, [currentDate, priorities]);

  const saveCanvasData = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const canvasData = {
        items: canvasItems
          .filter(item => {
            // Filter out text items with empty content
            if (item.type === 'text') {
              return item.content && item.content.trim() !== '';
            }
            return true; // Keep all non-text items
          })
          .map(item => ({
            ...item,
            // Don't save editing state or blob URLs
            isEditing: undefined,
            url: item.type === 'image' ? undefined : item.url // Keep URLs for display but save file paths
          }))
      };
      
      // Only save empty state if user previously had content (they're clearing it)
      if (canvasData.items.length === 0 && !hasEverHadContent) {
        return;
      }
      
      const jsonString = JSON.stringify(canvasData);
      await invoke('save_brain_dump', {
        date: currentDate,
        content: jsonString
      });
    } catch (error) {
      console.error('Failed to save canvas data:', error);
    }
  }, [canvasItems, currentDate, hasEverHadContent]);

  // Handle app quit on window close
  useEffect(() => {
    // Only run in Tauri environment
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      const setupCloseHandler = async () => {
        const { appWindow } = await import('@tauri-apps/api/window');
        
        const unlisten = await appWindow.onCloseRequested(async () => {
          // Save any pending changes before closing
          if (brainDumpTimer) clearTimeout(brainDumpTimer);
          priorityTimers.forEach(timer => clearTimeout(timer));
          
          try {
            await saveCanvasData();
            await savePriorities();
          } catch (error) {
            console.error('Error saving on quit:', error);
          }
          
          // Explicitly close the window after saving
          await appWindow.close();
        });
        
        return unlisten;
      };
      
      let unlisten: (() => void) | undefined;
      setupCloseHandler().then(fn => unlisten = fn);
      
      return () => {
        if (unlisten) unlisten();
      };
    }
  }, [brainDumpTimer, priorityTimers, saveCanvasData, savePriorities]);


  const handlePriorityInput = (index: number, value: string) => {
    // Validate priority input
    const validation = validatePriority(value);
    if (!validation.isValid) {
      alert(validation.error);
      return;
    }

    const newPriorities = [...priorities];
    newPriorities[index] = validation.sanitized;
    setPriorities(newPriorities);
    
    const newTimers = [...priorityTimers];
    if (newTimers[index]) clearTimeout(newTimers[index]);
    newTimers[index] = setTimeout(() => {
      savePriorities();
    }, 500);
    setPriorityTimers(newTimers);
  };

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newDarkMode));
      document.documentElement.classList.toggle('dark', newDarkMode);
    }
  };

  const navigateDate = (days: number) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + days);
    setCurrentDate(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setCurrentDate(new Date().toISOString().split('T')[0]);
  };

  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const openCreateModal = (startTime: string) => {
    setEditingBlock(null);
    setModalTitle('');
    setModalNotes('');
    setModalColor('#3b82f6');
    setModalTags('');
    setSelectedStartMinutes(timeToMinutes(startTime));
    setSelectedDurationMinutes(30);
    setShowModal(true);
  };

  const saveTimeBlock = async () => {
    try {
      // Validate input
      const validation = validateTimeBlock({
        title: modalTitle,
        notes: modalNotes,
        tags: modalTags,
        duration: selectedDurationMinutes,
        startMinutes: selectedStartMinutes
      });

      if (!validation.isValid) {
        alert('Validation errors:\n' + validation.errors.join('\n'));
        return;
      }

      const { invoke } = await import('@tauri-apps/api/tauri');
      
      const block: TimeBlock = {
        id: editingBlock?.id,
        date: currentDate,
        start_minutes: selectedStartMinutes,
        duration_minutes: selectedDurationMinutes,
        title: validation.sanitized.title,
        color: modalColor,
        tags: validation.sanitized.tags ? validation.sanitized.tags.split(',').map(t => t.trim()).filter(t => t) : []
      };
      
      await invoke('save_time_block', { 
        block, 
        notesContent: validation.sanitized.notes || null 
      });
      
      await loadDayData();
      setShowModal(false);
    } catch (error) {
      console.error('Failed to save time block:', error);
      alert('Failed to save time block. Please try again.');
    }
  };

  const getBlocksForTime = (startMinutes: number): TimeBlock[] => {
    return timeBlocks.filter(block => 
      block.start_minutes === startMinutes
    );
  };
  
  const getEventsForTime = (startMinutes: number): CalendarEvent[] => {
    return calendarEvents.filter(event => {
      const eventMinutes = event.start.getHours() * 60 + event.start.getMinutes();
      const eventEndMinutes = event.end.getHours() * 60 + event.end.getMinutes();
      
      // Check if this 30-minute slot overlaps with the event
      return eventMinutes <= startMinutes && eventEndMinutes > startMinutes;
    });
  };
  
  const formatEventTime = (event: CalendarEvent): string => {
    if (event.isAllDay) {
      return 'All day';
    }
    
    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      });
    };
    
    return `${formatTime(event.start)} - ${formatTime(event.end)}`;
  };

  // Resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleHorizontalMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const newSidebarWidth = Math.max(180, Math.min(400, e.clientX - 12));
    setSidebarWidth(newSidebarWidth);
  }, [isResizing]);

  const handleHorizontalMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleHorizontalMouseMove);
      document.addEventListener('mouseup', handleHorizontalMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleHorizontalMouseMove);
        document.removeEventListener('mouseup', handleHorizontalMouseUp);
      };
    }
  }, [isResizing, handleHorizontalMouseMove, handleHorizontalMouseUp]);

  // Vertical resize handlers
  const handleVerticalMouseDown = useCallback((e: React.MouseEvent) => {
    console.log('🎯 Vertical divider clicked!');
    setIsResizingVertical(true);
    e.preventDefault();
    e.stopPropagation(); // Prevent other handlers from interfering
  }, []);

  const handleVerticalMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingVertical) return;
    
    console.log('📏 Moving vertical divider, clientY:', e.clientY);
    
    // Simpler approach: calculate height from a fixed reference point
    // Assuming header is about 60px, use that as reference
    const newHeight = Math.max(120, Math.min(500, e.clientY - 120));
    console.log('📏 New height calculated:', newHeight, 'current prioritiesHeight:', prioritiesHeight, 'clientY:', e.clientY);
    setPrioritiesHeight(newHeight);
  }, [isResizingVertical, prioritiesHeight]);

  const handleVerticalMouseUp = useCallback(() => {
    setIsResizingVertical(false);
  }, []);

  useEffect(() => {
    if (isResizingVertical) {
      document.addEventListener('mousemove', handleVerticalMouseMove);
      document.addEventListener('mouseup', handleVerticalMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleVerticalMouseMove);
        document.removeEventListener('mouseup', handleVerticalMouseUp);
      };
    }
  }, [isResizingVertical, handleVerticalMouseMove, handleVerticalMouseUp]);

  // Canvas handlers
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Create a new text item
    const newTextItem = {
      id: Date.now().toString(),
      type: 'text' as const,
      x,
      y,
      content: '',
      isEditing: true
    };
    
    setCanvasItems(prev => [...prev, newTextItem]);
  }, [isDragging]);

  const handleItemMouseDown = useCallback((e: React.MouseEvent, itemId: string, itemType: 'text' | 'image') => {
    e.stopPropagation();
    setMouseDownTime(Date.now());
    
    const rect = e.currentTarget.getBoundingClientRect();
    setDraggedItem(itemId);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    
    // For images, start dragging immediately
    if (itemType === 'image') {
      setIsDragging(true);
    }
  }, []);

  const handleItemClick = useCallback((e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    
    // Check if this was a quick click (not a drag)
    const clickTime = Date.now();
    if (mouseDownTime && (clickTime - mouseDownTime) < 150) {
      // Quick click - edit text
      setCanvasItems(prev => prev.map(i => 
        i.id === itemId ? { ...i, isEditing: true } : i
      ));
    }
  }, [mouseDownTime]);

  const handleCanvasMouseMove = useCallback((e: MouseEvent) => {
    // Don't interfere with vertical resizing
    if (isResizingVertical) return;
    if (!draggedItem) return;
    
    // Start dragging if mouse has moved significantly or enough time has passed
    if (!isDragging && mouseDownTime) {
      const timeDiff = Date.now() - mouseDownTime;
      const startDrag = timeDiff > 150; // Start drag after 150ms
      
      if (startDrag) {
        setIsDragging(true);
      }
    }
    
    if (!isDragging) return;
    
    const canvas = document.getElementById('brain-dump-canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragOffset.x;
    const newY = e.clientY - rect.top - dragOffset.y;
    
    setCanvasItems(prev => prev.map(item => 
      item.id === draggedItem 
        ? { ...item, x: Math.max(0, newX), y: Math.max(0, newY) }
        : item
    ));
  }, [isDragging, draggedItem, dragOffset, mouseDownTime, isResizingVertical]);

  const handleCanvasMouseUp = useCallback(() => {
    // Don't interfere with vertical resizing
    if (isResizingVertical) return;
    setIsDragging(false);
    setDraggedItem(null);
    setMouseDownTime(null);
  }, [isResizingVertical]);

  const handleFileDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left;
    const dropY = e.clientY - rect.top;
    
    for (const file of imageFiles) {
      // Validate file upload
      const validation = validateFileUpload(file);
      if (!validation.isValid) {
        alert(validation.error);
        continue;
      }

      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const arrayBuffer = await file.arrayBuffer();
        const fileData = Array.from(new Uint8Array(arrayBuffer));
        
        await invoke('save_attachment', {
          timeBlockId: 0,
          date: currentDate,
          fileData,
          filename: file.name,
          fileType: 'image'
        });

        const blob = new Blob([arrayBuffer], { type: file.type });
        const url = URL.createObjectURL(blob);
        
        const newImageItem = {
          id: Date.now().toString() + Math.random(),
          type: 'image' as const,
          x: dropX,
          y: dropY,
          width: 150,
          height: 100,
          url,
          name: file.name
        };
        
        setCanvasItems(prev => [...prev, newImageItem]);
        
      } catch (error) {
        console.error('Failed to upload file:', error);
        alert('Failed to upload image. Please try again.');
      }
    }
  }, [currentDate]);

  const updateTextContent = useCallback((itemId: string, content: string, removeIfEmpty: boolean = false) => {
    const trimmedContent = content.trim();
    
    if (trimmedContent === '' && removeIfEmpty) {
      // Only remove empty text items when explicitly requested
      setCanvasItems(prev => prev.filter(item => item.id !== itemId));
    } else {
      // Update content and stop editing (preserve even empty content)
      setCanvasItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, content: trimmedContent, isEditing: false } : item
      ));
    }
  }, []);


  // Auto-save canvas data when items change
  useEffect(() => {
    const timer = setTimeout(() => {
      saveCanvasData();
    }, 1000); // Save 1 second after changes

    return () => clearTimeout(timer);
  }, [canvasItems, saveCanvasData]);

  // Also save when leaving the page or switching dates
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Only save if we have meaningful content
      const hasContent = canvasItems.some(item => 
        item.type === 'image' || (item.type === 'text' && item.content && item.content.trim())
      );
      if (hasContent) {
        saveCanvasData();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [canvasItems, saveCanvasData]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleCanvasMouseMove);
      document.addEventListener('mouseup', handleCanvasMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleCanvasMouseMove);
        document.removeEventListener('mouseup', handleCanvasMouseUp);
      };
    }
  }, [isDragging, handleCanvasMouseMove, handleCanvasMouseUp]);

  // Calendar functions
  const loadCalendarConnections = useCallback(async () => {
    try {
      const { calendarService } = await import('../lib/calendar-service');
      await calendarService.initialize(); // Ensure service is initialized
      const connections = calendarService.getConnections();
      setCalendarConnections(connections.map(conn => ({
        id: conn.id,
        provider: conn.provider,
        email: conn.email,
        connectedAt: conn.connectedAt
      })));
    } catch (error) {
      console.error('Failed to load calendar connections:', error);
    }
  }, []);

  const connectCalendarProvider = useCallback(async (providerId: string) => {
    try {
      console.log('🔥 React: Starting connection for provider:', providerId);
      setIsConnectingCalendar(true);
      
      const { calendarService } = await import('../lib/calendar-service');
      await calendarService.initialize(); // Ensure service is initialized
      console.log('🔥 React: Service initialized, calling connectProvider');
      const connection = await calendarService.connectProvider(providerId);
      console.log('🔥 React: Connection created:', connection);
      
      // Refresh connections list
      console.log('🔥 React: Refreshing connections list');
      await loadCalendarConnections();
      
      alert(`Successfully connected ${connection.provider} calendar for ${connection.email}!`);
    } catch (error: unknown) {
      console.error('Failed to connect calendar:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage?.startsWith('AUTH_TOKEN_NEEDED:')) {
        // Show token input UI
        const provider = errorMessage.split(':')[1];
        setPendingProvider(provider);
        setShowTokenInput(true);
        setAuthToken('');
        
        // Also show the URL in case browser didn't open
        const authUrl = `https://www.phenx.io/timebloc?provider=${provider}`;
        console.log('Auth URL:', authUrl);
        alert(`If the browser didn't open automatically, please visit:\n${authUrl}\n\nThen copy the token and paste it in the next dialog.`);
      } else if (errorMessage?.includes('complete authentication in your browser')) {
        alert('Calendar authentication opened in your browser. Please complete the sign-in process there, then try connecting again.');
      } else if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/popup-blocked') {
        alert('Popup was blocked. Please allow popups for this app or try again.');
      } else {
        alert(`Failed to connect calendar: ${errorMessage}`);
      }
    } finally {
      setIsConnectingCalendar(false);
    }
  }, []);

  const submitAuthToken = useCallback(async () => {
    if (!authToken.trim() || !pendingProvider) return;
    
    try {
      setIsConnectingCalendar(true);
      const { calendarService } = await import('../lib/calendar-service');
      
      console.log('🔥 React: Processing auth token');
      const connection = await calendarService.processAuthToken(pendingProvider, authToken);
      console.log('🔥 React: Token processed, connection created:', connection);
      
      // Close token input
      setShowTokenInput(false);
      setAuthToken('');
      setPendingProvider('');
      
      // Refresh connections list
      await loadCalendarConnections();
      
      alert(`Successfully connected ${connection.provider} calendar for ${connection.email}!`);
    } catch (error: unknown) {
      console.error('Failed to process auth token:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to process token: ${errorMessage}`);
    } finally {
      setIsConnectingCalendar(false);
    }
  }, [authToken, pendingProvider, loadCalendarConnections]);
  
  
  const disconnectCalendar = useCallback(async (connectionId: string) => {
    try {
      const { calendarService } = await import('../lib/calendar-service');
      await calendarService.initialize(); // Ensure service is initialized
      await calendarService.removeConnection(connectionId);
      await loadCalendarConnections();
    } catch (error) {
      console.error('Failed to disconnect calendar:', error);
    }
  }, [loadCalendarConnections]);
  
  const syncCalendars = useCallback(async () => {
    try {
      const { calendarService } = await import('../lib/calendar-service');
      await calendarService.initialize(); // Ensure service is initialized
      const startDate = new Date(currentDate + 'T00:00:00');
      const endDate = new Date(currentDate + 'T23:59:59');
      const events = await calendarService.getAllCalendarEvents(startDate, endDate);
      setCalendarEvents(events);
    } catch (error) {
      console.warn('Calendar sync failed:', error);
    }
  }, [currentDate]);

  // Load calendar connections when settings modal opens
  useEffect(() => {
    if (showSettingsModal) {
      loadCalendarConnections();
    }
  }, [showSettingsModal, loadCalendarConnections]);
  
  // Periodic calendar sync
  useEffect(() => {
    if (calendarConnections.length > 0) {
      const interval = setInterval(() => {
        syncCalendars();
      }, 5000); // Sync every 5 seconds
      
      return () => clearInterval(interval);
    }
  }, [calendarConnections.length, syncCalendars]);
  
  // Initial calendar sync when connections are loaded
  useEffect(() => {
    if (calendarConnections.length > 0) {
      syncCalendars();
    }
  }, [calendarConnections, syncCalendars]);

  return (
    <div className="h-screen bg-background text-foreground">
      <div className="flex flex-col h-full gap-3 p-3 max-w-none mx-auto">
        {/* Header */}
        <header className="flex items-center gap-4 pb-2 border-b border-border h-[60px]">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="text-2xl">⏱</span>
            The Time Box
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => navigateDate(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Input 
              type="date" 
              value={currentDate} 
              onChange={(e) => setCurrentDate(e.target.value)}
              className="min-w-[140px]"
            />
            
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => navigateDate(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            <Button 
              variant="outline" 
              size="icon"
              onClick={goToToday}
              title="Today"
            >
              <Target className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="ml-auto flex items-center gap-1">
            <Button 
              variant="ghost"
              size="sm"
              onClick={() => setShowSettingsModal(true)}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button 
              variant="outline"
              size="icon"
              onClick={toggleDarkMode}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {/* Main Content with Resizable Layout */}
        <div className="flex flex-1">
          {/* Sidebar */}
          <div 
            className="flex flex-col" 
            style={{ width: `${sidebarWidth}px` }}
          >
          <Card className="flex flex-col" style={{ height: `${prioritiesHeight}px` }}>
            <CardHeader className="pb-1 px-3 pt-2">
              <CardTitle className="text-sm text-muted-foreground">Top Priorities</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 px-3 pb-2 overflow-hidden">
              <ScrollArea className="h-full pr-1">
                <div className="space-y-2">
                  {priorities.map((priority, i) => (
                    <Input
                      key={i}
                      value={priority}
                      onChange={(e) => handlePriorityInput(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur(); // This will trigger save
                        }
                      }}
                      placeholder=""
                      className="border-0 border-b border-border rounded-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-primary"
                    />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
          {/* Vertical Resize Handle */}
          <div 
            className="resize-handle-vertical"
            onMouseDown={handleVerticalMouseDown}
          />

          <Card className="flex-1 mt-2 flex flex-col">
            <CardHeader className="pb-1 px-3 pt-2 flex-shrink-0">
              <CardTitle className="text-sm text-muted-foreground">Brain Dump</CardTitle>
              <p className="text-xs text-muted-foreground/60 mt-1">Click anywhere to add text • Drag & drop images</p>
            </CardHeader>
            <CardContent className="relative flex-1 overflow-hidden px-0 pb-0">
              <div 
                className="absolute inset-0 opacity-40 pointer-events-none z-0"
                style={{
                  backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)',
                  backgroundSize: '18px 18px',
                  backgroundPosition: '9px 9px'
                }}
              />
              <div 
                id="brain-dump-canvas"
                className="relative w-full h-full cursor-crosshair"
                onClick={handleCanvasClick}
                onDrop={handleFileDrop}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={(e) => e.preventDefault()}
              >
                {canvasItems.map((item) => (
                  <div
                    key={item.id}
                    className="absolute select-none"
                    style={{
                      left: `${item.x}px`,
                      top: `${item.y}px`,
                      width: item.width ? `${item.width}px` : 'auto',
                      height: item.height ? `${item.height}px` : 'auto'
                    }}
                    onMouseDown={(e) => handleItemMouseDown(e, item.id, item.type)}
                    onClick={(e) => item.type === 'text' ? handleItemClick(e, item.id) : undefined}
                  >
                    {item.type === 'text' ? (
                      item.isEditing ? (
                        <input
                          autoFocus
                          defaultValue={item.content || ''}
                          className="bg-transparent border-0 outline-none text-xs text-foreground min-w-20 font-mono"
                          placeholder="Type here..."
                          onChange={(e) => {
                            // Update content in real-time (for auto-save)
                            setCanvasItems(prev => prev.map(i => 
                              i.id === item.id ? { ...i, content: e.target.value } : i
                            ));
                          }}
                          onBlur={(e) => updateTextContent(item.id, e.target.value, !item.content)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              updateTextContent(item.id, e.currentTarget.value);
                            } else if (e.key === 'Escape') {
                              // Cancel editing - restore original content or remove if empty
                              if (item.content && item.content.trim()) {
                                setCanvasItems(prev => prev.map(i => 
                                  i.id === item.id ? { ...i, isEditing: false } : i
                                ));
                              } else {
                                setCanvasItems(prev => prev.filter(i => i.id !== item.id));
                              }
                            }
                          }}
                        />
                      ) : (
                        <div
                          className="text-xs text-foreground cursor-pointer hover:bg-muted/20 px-1 py-0.5 rounded font-mono"
                        >
                          {item.content || 'Click to edit'}
                        </div>
                      )
                    ) : (
                      <div className="relative group">
                        <img
                          src={item.url}
                          alt={item.name || 'Uploaded image'}
                          className="rounded shadow-sm cursor-move object-cover"
                          style={{ width: item.width, height: item.height }}
                          draggable={false}
                        />
                        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-4 w-4 p-0 rounded-full text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCanvasItems(prev => prev.filter(i => i.id !== item.id));
                            }}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </div>
          
          {/* Resize Handle */}
          <div 
            className="resize-handle"
            onMouseDown={handleMouseDown}
          />

          {/* Time Grid */}
          <Card className="overflow-hidden flex-1 ml-2">
          <div className="grid grid-cols-[40px_1fr_1fr] bg-muted/50 border-b text-xs font-medium">
            <div className="p-1 text-center border-r"></div>
            <div className="p-1 text-center border-r">:00</div>
            <div className="p-1 text-center">:30</div>
          </div>
          
          <ScrollArea className="h-[calc(100vh-200px)]" ref={timeGridRef}>
            <div className="grid grid-cols-[40px_1fr_1fr]">
              {Array.from({length: 24}).map((_, hourIndex) => {
                const hour = hourIndex;
                const hourStr = hour.toString().padStart(2, '0');
                
                return (
                  <div key={hourIndex} className="contents">
                    <div className="p-1 text-xs font-medium text-center text-muted-foreground bg-muted/50 border-r border-b">
                      {hourStr}
                    </div>
                    
                    <Button
                      variant="ghost"
                      className="h-8 justify-start border-r border-b p-1 rounded-none hover:bg-muted/50"
                      onClick={() => openCreateModal(`${hourStr}:00`)}
                    >
                      <div className="space-y-1 w-full">
                        {/* Time blocks */}
                        {getBlocksForTime(hour * 60).map((block) => (
                          <div
                            key={block.id}
                            className="text-xs text-white px-1 py-0.5 rounded text-left cursor-pointer"
                            style={{ backgroundColor: block.color }}
                            onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Open edit modal
                            }}
                          >
                            <div className="font-medium truncate">{block.title}</div>
                            <div className="opacity-90 text-[10px]">
                              {minutesToTime(block.start_minutes)} - {minutesToTime(block.start_minutes + block.duration_minutes)}
                            </div>
                          </div>
                        ))}
                        
                        {/* Calendar events */}
                        {getEventsForTime(hour * 60).map((event) => (
                          <div
                            key={`cal-${event.id}`}
                            className={`text-xs px-1 py-0.5 rounded text-left border ${
                              event.provider === 'google' 
                                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100 dark:border-blue-600'
                                : 'border-purple-300 bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-100 dark:border-purple-600'
                            }`}
                            title={`${event.title}${event.location ? ` • ${event.location}` : ''}${event.description ? `\n${event.description}` : ''}`}
                          >
                            <div className="font-medium truncate flex items-center gap-1">
                              {event.provider === 'google' ? '📅' : '📮'} {event.title}
                            </div>
                            <div className="opacity-90 text-[10px]">
                              {formatEventTime(event)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Button>
                    
                    <Button
                      variant="ghost"
                      className="h-8 justify-start border-b p-1 rounded-none hover:bg-muted/50"
                      onClick={() => openCreateModal(`${hourStr}:30`)}
                    >
                      <div className="space-y-1 w-full">
                        {/* Time blocks */}
                        {getBlocksForTime(hour * 60 + 30).map((block) => (
                          <div
                            key={block.id}
                            className="text-xs text-white px-1 py-0.5 rounded text-left cursor-pointer"
                            style={{ backgroundColor: block.color }}
                            onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Open edit modal
                            }}
                          >
                            <div className="font-medium truncate">{block.title}</div>
                            <div className="opacity-90 text-[10px]">
                              {minutesToTime(block.start_minutes)} - {minutesToTime(block.start_minutes + block.duration_minutes)}
                            </div>
                          </div>
                        ))}
                        
                        {/* Calendar events */}
                        {getEventsForTime(hour * 60 + 30).map((event) => (
                          <div
                            key={`cal-${event.id}`}
                            className={`text-xs px-1 py-0.5 rounded text-left border ${
                              event.provider === 'google' 
                                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100 dark:border-blue-600'
                                : 'border-purple-300 bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-100 dark:border-purple-600'
                            }`}
                            title={`${event.title}${event.location ? ` • ${event.location}` : ''}${event.description ? `\n${event.description}` : ''}`}
                          >
                            <div className="font-medium truncate flex items-center gap-1">
                              {event.provider === 'google' ? '📅' : '📮'} {event.title}
                            </div>
                            <div className="opacity-90 text-[10px]">
                              {formatEventTime(event)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          </Card>
        </div>
      </div>

      {/* Time Block Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingBlock ? 'Edit Time Block' : 'Create Time Block'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveTimeBlock();
                  }
                }}
                placeholder="What are you working on?"
                className="mt-1"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Start Time</label>
              <Select value={selectedStartMinutes.toString()} onValueChange={(value) => setSelectedStartMinutes(parseInt(value))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({length: 24}).map((_, hourIndex) => {
                    const hour = hourIndex;
                    return [
                      <SelectItem key={`${hour}:00`} value={(hour * 60).toString()}>
                        {hour.toString().padStart(2, '0')}:00
                      </SelectItem>,
                      <SelectItem key={`${hour}:30`} value={(hour * 60 + 30).toString()}>
                        {hour.toString().padStart(2, '0')}:30
                      </SelectItem>
                    ];
                  })}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Duration</label>
              <Select value={selectedDurationMinutes.toString()} onValueChange={(value) => setSelectedDurationMinutes(parseInt(value))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Color</label>
              <input
                type="color"
                value={modalColor}
                onChange={(e) => setModalColor(e.target.value)}
                className="mt-1 w-16 h-10 border border-input rounded cursor-pointer"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Tags (comma separated)</label>
              <Input
                value={modalTags}
                onChange={(e) => setModalTags(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveTimeBlock();
                  }
                }}
                placeholder="work, meeting, project"
                className="mt-1"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={4}
                className="mt-1"
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={saveTimeBlock}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Settings Modal */}
      <Dialog open={showSettingsModal} onOpenChange={(open) => {
        console.log('🔥 Settings modal state changed:', open);
        setShowSettingsModal(open);
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Calendar Integration Section */}
            <div>
              <h3 className="text-lg font-medium mb-4">Calendar Integration</h3>
              
              {calendarConnections.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
                  <div className="text-muted-foreground mb-4">
                    Connect your calendars to see events in your time grid
                  </div>
                  <div className="flex flex-col gap-2 items-center">
                    <Button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔥 Button clicked - Connect Google Calendar');
                        console.log('🔥 connectCalendarProvider function exists:', typeof connectCalendarProvider);
                        if (connectCalendarProvider) {
                          connectCalendarProvider('google');
                        } else {
                          console.error('🔥 ERROR: connectCalendarProvider is not defined!');
                        }
                      }}
                      disabled={isConnectingCalendar}
                      className="w-48"
                    >
                      📅 {isConnectingCalendar ? 'Connecting...' : 'Connect Google Calendar'}
                    </Button>
                    <Button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        connectCalendarProvider('microsoft');
                      }}
                      disabled={isConnectingCalendar}
                      variant="outline"
                      className="w-48"
                    >
                      📮 {isConnectingCalendar ? 'Connecting...' : 'Connect Microsoft Outlook'}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-4">
                    ✨ Powered by Firebase Auth - secure OAuth popups like Spotify, Discord, etc.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {calendarConnections.map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {connection.provider === 'google' ? '📅' : '📮'} {connection.email}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {connection.provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'} • Connected {new Date(connection.connectedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => disconnectCalendar(connection.id)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => connectCalendarProvider('google')}
                      disabled={isConnectingCalendar}
                    >
                      📅 {isConnectingCalendar ? 'Connecting...' : 'Add Google Calendar'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => connectCalendarProvider('microsoft')}
                      disabled={isConnectingCalendar}
                    >
                      📮 {isConnectingCalendar ? 'Connecting...' : 'Add Microsoft Outlook'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Sync Settings */}
            <div>
              <h3 className="text-lg font-medium mb-4">Sync Settings</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Auto-sync interval</span>
                  <Select defaultValue="5">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 seconds</SelectItem>
                      <SelectItem value="15">15 seconds</SelectItem>
                      <SelectItem value="30">30 seconds</SelectItem>
                      <SelectItem value="60">1 minute</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-muted-foreground">
                  How often to sync with your calendar providers
                </div>
              </div>
            </div>

            {/* Privacy Notice */}
            <div className="bg-muted/30 p-4 rounded-lg">
              <div className="text-sm">
                <div className="font-medium mb-2">🔒 Privacy First</div>
                <div className="text-muted-foreground">
                  • All calendar data is stored locally on your device<br/>
                  • No data is sent to external servers<br/>
                  • OAuth tokens are encrypted and stored securely
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Token Input Dialog */}
      <Dialog open={showTokenInput} onOpenChange={setShowTokenInput}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Complete Authentication</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p className="mb-2">
                A browser window has opened for {pendingProvider === 'google' ? 'Google' : 'Microsoft'} authentication.
              </p>
              <div className="bg-muted p-3 rounded text-xs">
                <strong>Steps:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Complete sign-in in the browser window</li>
                  <li>Copy the token that appears on the success page</li>
                  <li>Paste it in the box below</li>
                  <li>Click &quot;Connect&quot;</li>
                </ol>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Authentication Token</label>
              <Textarea
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Paste the authentication token here..."
                rows={4}
                className="mt-1 font-mono text-xs"
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowTokenInput(false);
                  setAuthToken('');
                  setPendingProvider('');
                }}
                disabled={isConnectingCalendar}
              >
                Cancel
              </Button>
              <Button 
                onClick={submitAuthToken}
                disabled={!authToken.trim() || isConnectingCalendar}
              >
                {isConnectingCalendar ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
