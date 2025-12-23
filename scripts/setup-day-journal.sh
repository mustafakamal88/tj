#!/bin/bash

# Day Journal Feature - Setup Script
# This script helps set up the database migration and storage bucket

set -e

echo "🚀 Setting up Day Journal Feature..."
echo ""

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "⚠️  Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Apply database migration
echo "📦 Applying database migration..."
if [ -f "supabase/migrations/20251223000000_day_journal_and_trade_media.sql" ]; then
    echo "   Migration file found: 20251223000000_day_journal_and_trade_media.sql"
    
    # Option 1: Using Supabase CLI (if linked to project)
    read -p "Do you want to apply the migration via Supabase CLI? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        supabase db push
        echo "   ✅ Migration applied via CLI"
    else
        echo ""
        echo "   📋 Manual steps:"
        echo "   1. Go to your Supabase project dashboard"
        echo "   2. Navigate to SQL Editor"
        echo "   3. Copy and paste the content of:"
        echo "      supabase/migrations/20251223000000_day_journal_and_trade_media.sql"
        echo "   4. Run the SQL"
        echo ""
    fi
else
    echo "   ❌ Migration file not found!"
    exit 1
fi

echo ""
echo "🪣 Setting up Storage Bucket..."
echo ""
echo "   📋 Manual steps required:"
echo "   1. Go to Supabase Dashboard → Storage"
echo "   2. Create new bucket: 'trade-screenshots'"
echo "   3. Set as Private (not public)"
echo "   4. Apply the following RLS policies:"
echo ""
echo "      -- Allow users to upload their own screenshots"
echo "      CREATE POLICY \"Users upload own screenshots\""
echo "      ON storage.objects FOR INSERT"
echo "      TO authenticated"
echo "      WITH CHECK ("
echo "        bucket_id = 'trade-screenshots' AND"
echo "        (storage.foldername(name))[1] = auth.uid()::text"
echo "      );"
echo ""
echo "      -- Allow users to view their own screenshots"
echo "      CREATE POLICY \"Users view own screenshots\""
echo "      ON storage.objects FOR SELECT"
echo "      TO authenticated"
echo "      USING ("
echo "        bucket_id = 'trade-screenshots' AND"
echo "        (storage.foldername(name))[1] = auth.uid()::text"
echo "      );"
echo ""
echo "      -- Allow users to delete their own screenshots"
echo "      CREATE POLICY \"Users delete own screenshots\""
echo "      ON storage.objects FOR DELETE"
echo "      TO authenticated"
echo "      USING ("
echo "        bucket_id = 'trade-screenshots' AND"
echo "        (storage.foldername(name))[1] = auth.uid()::text"
echo "      );"
echo ""

echo "✅ Setup instructions complete!"
echo ""
echo "📚 Next steps:"
echo "   1. Complete the storage bucket setup above"
echo "   2. Run: npm run dev"
echo "   3. Open http://localhost:5173/dashboard"
echo "   4. Click any calendar tile to test the Day View"
echo ""
echo "📖 For detailed documentation, see:"
echo "   docs/day-journal-feature.md"
echo ""
