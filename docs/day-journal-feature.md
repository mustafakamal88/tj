# Day Journal Feature - Implementation Guide

## Overview

The Day Journal feature adds a comprehensive notebook-style interface for viewing and documenting trading days. Users can click on any calendar tile to open a detailed day view with trades, notes, screenshots, news, and charts.

## Features Implemented

### 1. Clickable Calendar Tiles
- Calendar tiles in the dashboard are now clickable buttons
- Clicking a tile opens the Day View drawer
- Keyboard accessible (Enter/Space keys)
- Focus states and hover effects
- URL updates with `?day=YYYY-MM-DD` query parameter for shareable links

### 2. Day View Drawer
- Right-side drawer on desktop (640-900px width)
- Full-screen on mobile
- Notebook-style dark UI with "paper" panels
- Two-column layout:
  - **Left Column**: Main notebook page with day notes and trades list
  - **Right Column**: Insights sidebar with chart, news, and metrics

### 3. Day Summary Metrics
Located in the drawer header:
- Total P/L (color-coded)
- Number of trades
- Win rate percentage
- Average Risk/Reward ratio
- Biggest win/loss

### 4. Day Notes Editor
- Rich textarea with autosave capability
- Explicit "Save" button
- Pre-populated prompts for reflection:
  - Why I entered these trades
  - What was my plan?
  - Mistakes made
  - What I'll do differently next time

### 5. Trades List
Each trade card shows:
- Symbol and side (long/short)
- Entry/exit times and prices
- P/L and percentage
- Setup tag
- Icons for notes and screenshots
- Click to open Trade Detail panel

### 6. Trade Detail Panel
Opens when clicking a trade, showing:
- **Header**: Symbol, side, P/L, duration
- **Levels**: Entry, exit, SL, TP
- **Trade Notes**: Separate from day notes, with autosave
- **Screenshots Gallery**: Grid view with upload and delete
- **Additional Info**: Setup, emotions, mistakes, tags

### 7. Screenshot Upload & Gallery
- Multi-file upload support
- Grid thumbnail view
- Click thumbnail to open lightbox viewer
- Lightbox features:
  - Next/Previous navigation (arrows and keyboard)
  - Image counter (1/3, 2/3, etc.)
  - Delete button
  - Full-screen view
- Files stored in Supabase Storage bucket `trade-screenshots`
- RLS policies ensure users only access their own screenshots

### 8. News Block
- Displays important news for the selected day
- Filters high-impact and USD/Gold-related news
- Shows: currency, impact level, time, title, source
- Placeholder ready for future API integration

### 9. TradingView Chart
- Embedded TradingView widget
- Shows selected trade symbol (or default XAUUSD)
- Dark theme matching app design
- 1-hour timeframe
- Responsive sizing

### 10. Day Insights
Computed metrics:
- Biggest win/loss
- Win/loss count
- Overtrading warning (>5 trades)

## Database Schema

### New Tables

#### `day_journals`
```sql
- id: uuid (PK)
- user_id: uuid (FK → auth.users)
- day: date
- notes: text
- created_at: timestamptz
- updated_at: timestamptz
- UNIQUE(user_id, day)
```

#### `trade_notes`
```sql
- id: uuid (PK)
- trade_id: uuid (FK → trades)
- user_id: uuid (FK → auth.users)
- notes: text
- created_at: timestamptz
- updated_at: timestamptz
- UNIQUE(trade_id)
```

#### `trade_media`
```sql
- id: uuid (PK)
- trade_id: uuid (FK → trades)
- user_id: uuid (FK → auth.users)
- url: text
- kind: text (default 'screenshot')
- created_at: timestamptz
```

#### `day_news`
```sql
- id: uuid (PK)
- day: date
- currency: text
- title: text
- impact: text (high/medium/low)
- time: text
- source: text
- created_at: timestamptz
```

### RLS Policies
All tables have Row Level Security enabled:
- Users can only CRUD their own data (via `auth.uid()`)
- News table is read-only for all authenticated users

### Storage Bucket
- **Bucket name**: `trade-screenshots`
- **Public**: No (private, URL-based access)
- **Policies**: Users can upload/view/delete only their own screenshots
- **Path structure**: `{user_id}/{trade_id}/{timestamp}.{ext}`

## API Functions

Located in `/src/app/utils/day-journal-api.ts`:

### Day Journal
- `getDayJournal(day: string)` - Fetch journal for a day
- `upsertDayJournal(day: string, notes: string)` - Create/update journal

### Trades
- `getDayTrades(day: string)` - Fetch all trades for a day
- `calculateDayMetrics(trades: Trade[])` - Compute metrics

### Trade Details
- `getTradeDetail(tradeId: string)` - Fetch trade with notes and media
- `upsertTradeNotes(tradeId: string, notes: string)` - Create/update trade notes

### Media
- `addTradeMedia(tradeId: string, file: File)` - Upload screenshot
- `deleteTradeMedia(mediaId: string)` - Delete screenshot

### News
- `getDayNews(day: string)` - Fetch news for a day

## Components

### New Components
1. `day-view-drawer.tsx` - Main day view drawer container
2. `trade-detail-panel.tsx` - Individual trade detail view
3. `screenshot-gallery.tsx` - Screenshot grid and lightbox
4. `day-news-block.tsx` - News display component
5. `trading-view-chart.tsx` - TradingView widget wrapper

### Modified Components
1. `dashboard.tsx` - Added day click handling and routing

## Setup Instructions

### 1. Run Database Migration

```bash
# Navigate to Supabase project directory
cd /workspaces/tj

# Run the migration
supabase db reset  # Or apply migration file via Supabase dashboard
```

Or manually run the migration SQL:
```bash
# Copy the migration file to Supabase SQL Editor
cat supabase/migrations/20251223000000_day_journal_and_trade_media.sql
```

### 2. Create Storage Bucket

In Supabase Dashboard:
1. Go to Storage
2. Create new bucket: `trade-screenshots`
3. Set as Private
4. Apply RLS policies (see migration file comments)

Or via SQL (with service_role):
```sql
insert into storage.buckets (id, name, public)
values ('trade-screenshots', 'trade-screenshots', false)
on conflict (id) do nothing;
```

### 3. Install Dependencies (if needed)

The project should already have all necessary dependencies. If not:
```bash
npm install vaul  # For drawer component
```

### 4. Build and Test

```bash
npm run dev
```

## Usage Flow

1. **Open Dashboard**: Navigate to `/dashboard`
2. **Click a Calendar Tile**: Click any day with trades
3. **Day View Opens**: Right drawer slides in
4. **View Summary**: See day metrics at the top
5. **Edit Day Notes**: Type in the day notes section, click Save
6. **Click a Trade**: Opens trade detail panel
7. **View/Edit Trade Details**: See levels, notes, screenshots
8. **Upload Screenshots**: Click Upload, select images
9. **View Screenshots**: Click thumbnail for lightbox
10. **Close**: Click X or Escape to return to calendar

## URL Routing

- **Dashboard**: `/dashboard`
- **Day View**: `/dashboard?day=2025-12-23`
- **Trade View**: State-based (no URL param, but could be added)

The URL updates automatically when opening/closing day view, allowing users to:
- Share specific day views
- Refresh page and stay on the same day
- Use browser back/forward buttons

## Styling Notes

### Dark Theme Notebook Style
- Background: `bg-muted/20` to `bg-muted/30` for paper effect
- Borders: `border-muted` for subtle separation
- Cards: Slightly elevated with `bg-card/50`
- Focus states: `ring-2 ring-primary`

### Color Coding
- **Profit**: `text-green-600`
- **Loss**: `text-red-600`
- **High Impact News**: `text-red-500`
- **Today**: `bg-blue-50 dark:bg-blue-950/20`

### Responsive Design
- Desktop: Two-column layout, right drawer
- Mobile: Full-screen drawer, stacked layout
- Calendar: Horizontal scroll on small screens

## Future Enhancements

1. **News API Integration**: Connect to ForexFactory or similar
2. **Chart Annotations**: Mark entry/exit on TradingView chart
3. **Trade Correlation**: Show related trades or patterns
4. **AI Insights**: GPT-powered analysis of day performance
5. **Export**: PDF export of day journal
6. **Templates**: Pre-made day note templates
7. **Voice Notes**: Audio recording support
8. **Calendar Heatmap**: Visual P/L heatmap

## Troubleshooting

### Migration Issues
- Ensure `set_updated_at()` function exists (from base schema)
- Check RLS is enabled on all tables
- Verify foreign key references are correct

### Screenshot Upload Fails
- Check storage bucket exists
- Verify RLS policies are applied
- Ensure user is authenticated
- Check file size limits (default 50MB)

### TradingView Widget Not Loading
- Verify internet connection (loads from s3.tradingview.com)
- Check browser console for script errors
- Ensure symbol format is correct (FX:EURUSD, OANDA:XAUUSD)

### Day View Not Opening
- Check browser console for errors
- Verify trade data exists for that day
- Ensure Supabase client is initialized
- Check auth status

## Performance Considerations

- Day data loads in parallel (trades, journal, news)
- Screenshots use lazy loading in gallery
- Chart widget loads asynchronously
- Notes autosave debounced (800ms recommended)
- Use skeleton loaders during fetch

## Security

- All database queries use RLS
- Storage access controlled by user ID
- No client-side secret keys
- File uploads validated server-side
- SQL injection prevented by Supabase client

## Testing Checklist

- [ ] Click calendar tile opens day view
- [ ] URL updates with ?day= parameter
- [ ] Day metrics calculate correctly
- [ ] Day notes save and persist
- [ ] Trade list shows all trades for day
- [ ] Trade detail opens on click
- [ ] Trade notes save independently
- [ ] Screenshot upload works (single & multiple)
- [ ] Screenshot delete works
- [ ] Lightbox navigation works (next/prev/keyboard)
- [ ] News displays correctly
- [ ] Chart loads and shows correct symbol
- [ ] Close button returns to calendar
- [ ] Escape key closes drawer
- [ ] Mobile view works (full screen)
- [ ] Browser back button works
- [ ] Direct URL access works (/dashboard?day=2025-12-23)

## Code Organization

```
src/app/
├── components/
│   ├── dashboard.tsx (modified)
│   ├── day-view-drawer.tsx (new)
│   ├── trade-detail-panel.tsx (new)
│   ├── screenshot-gallery.tsx (new)
│   ├── day-news-block.tsx (new)
│   └── trading-view-chart.tsx (new)
├── utils/
│   └── day-journal-api.ts (new)
└── types/
    └── trade.ts (unchanged)

supabase/
└── migrations/
    └── 20251223000000_day_journal_and_trade_media.sql (new)
```

## Maintenance

### Regular Tasks
1. Monitor storage usage (screenshots can grow large)
2. Clean up orphaned media files
3. Archive old journals (optional)
4. Update news data source if API changes

### Database Maintenance
```sql
-- Find orphaned media (trade deleted but media remains)
SELECT * FROM trade_media tm
WHERE NOT EXISTS (
  SELECT 1 FROM trades t WHERE t.id = tm.trade_id
);

-- Count journals per user
SELECT user_id, COUNT(*) FROM day_journals
GROUP BY user_id;

-- Storage usage by user
SELECT user_id, COUNT(*), SUM(LENGTH(url)) 
FROM trade_media 
GROUP BY user_id;
```

## Support

For issues or questions:
1. Check browser console for errors
2. Verify database migrations are applied
3. Check Supabase logs for API errors
4. Review RLS policies in Supabase dashboard
5. Test with a fresh browser session (clear cache)

---

**Version**: 1.0  
**Date**: December 23, 2025  
**Author**: TJ Development Team
