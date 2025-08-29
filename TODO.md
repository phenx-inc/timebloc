# Time Blocker React - Development TODO

## Session Context
**Last Updated**: 2025-08-29
**Current State**: Application built successfully, authentication flow implemented with Firebase OAuth for calendar integration

## ✅ Completed
- Initial React/Next.js + Tauri setup
- Time blocking grid with 30-minute intervals
- Priorities list (5 items)
- Brain dump canvas with drag-and-drop images and text
- Dark mode toggle
- Resizable layout panels
- SQLite database integration
- Firebase authentication setup
- Google Calendar and Microsoft Outlook integration
- Environment variables configuration (.env.local created)
- Security improvements:
  - Removed hardcoded API keys
  - Added input validation
  - Implemented token encryption for database storage
  - Enhanced .gitignore

## 🔧 Current Issues

### 1. DMG Bundling Error
- **Issue**: `bundle_dmg.sh` fails during build
- **Workaround**: App builds successfully at `src-tauri/target/release/bundle/macos/Time Blocker React.app`
- **Solution**: Either fix bundling script or use manual DMG creation

### 2. Authentication Flow
- **Current Setup**: 
  - Tauri app opens browser to `https://www.phenx.io/timebloc?provider={google|microsoft}`
  - User completes auth on web page
  - User copies token and pastes back into app
- **Working**: Browser opens, token input dialog shows
- **Note**: Make sure web page at phenx.io/timebloc is properly configured for Firebase auth

## 🚀 Next Steps

### High Priority
1. **Fix Build Warnings**:
   - Update base64 crate usage in `crypto.rs` (use Engine::encode/decode)
   - Remove unused functions in `models.rs` or add `#[allow(dead_code)]`
   - Fix React Hook dependencies in `page.tsx`

2. **Complete Calendar Integration**:
   - Test Google Calendar event fetching
   - Test Microsoft Outlook integration
   - Implement calendar event refresh/sync
   - Add error handling for expired tokens

3. **Performance Optimizations**:
   - Split `page.tsx` (1445 lines) into smaller components
   - Implement React.memo for canvas items
   - Optimize re-renders
   - Consider state management library (Redux/Zustand)

### Medium Priority
4. **Features to Add**:
   - Edit/delete time blocks
   - Search functionality using Tantivy
   - Export time blocks (CSV/JSON)
   - Recurring time blocks
   - Time block templates
   - Notes editor for time blocks

5. **UI/UX Improvements**:
   - Better error messages (replace alerts with toast notifications)
   - Loading states for async operations
   - Keyboard shortcuts
   - Drag-and-drop time blocks
   - Better mobile responsiveness

### Low Priority
6. **DevOps & Distribution**:
   - Fix DMG bundling for macOS
   - Add Windows and Linux build configs
   - Set up GitHub Actions for CI/CD
   - Code signing for distribution
   - Auto-updater configuration

7. **Testing**:
   - Add unit tests for validation functions
   - Integration tests for Tauri commands
   - E2E tests for critical flows
   - Test calendar sync edge cases

## 📝 Important Notes

### Environment Setup
- **Firebase Config**: Located in `.env.local` (not committed)
- **Auth Domain**: Need to add Wix domain to Firebase authorized domains
- **Encryption Key**: Auto-generated in app data directory (`.encryption_key`)

### File Structure
```
src/
  app/page.tsx          # Main component (needs splitting)
  lib/
    calendar-service.ts # Calendar integration
    firebase.ts        # Firebase config
    validation.ts      # Input validation
src-tauri/
  src/
    main.rs           # Entry point
    calendar.rs       # Calendar backend
    crypto.rs         # Token encryption
    models.rs         # Data models
```

### Key Commands
```bash
# Development
npm run tauri:dev

# Build
npm run tauri:build

# The built app is at:
src-tauri/target/release/bundle/macos/Time Blocker React.app
```

### Security Considerations
- API keys now in environment variables only
- Tokens encrypted in database using AES-256-GCM
- Input validation on all user inputs
- File upload restricted to images under 10MB

### Known Quirks
- Wix iframe environment requires special handling for OAuth
- Tauri shell.open requires permission in tauri.conf.json
- Calendar sync runs every 5 seconds (might be too frequent)
- DMG bundling fails but .app works fine

## 🐛 Bugs to Fix
1. Memory leaks from event listeners not cleaned up properly
2. Canvas text validation not being used
3. Date validation function not being used
4. Some TypeScript `any` types need proper typing
5. Missing error boundaries for React components

## 💡 Future Ideas
- AI-powered time block suggestions
- Pomodoro timer integration
- Analytics dashboard
- Team collaboration features
- Mobile app version
- Voice input for quick time blocks
- Integration with other calendar services (Apple Calendar, etc.)

---

**Built by Humans and AI from Earth** 🌍