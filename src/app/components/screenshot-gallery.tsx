import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { TradeScreenshot } from '../utils/day-journal-api';
import { createTradeScreenshotSignedUrl } from '../utils/day-journal-api';

type ScreenshotGalleryProps = {
  media: TradeScreenshot[];
  onDelete: (mediaId: string) => void;
};

export function ScreenshotGallery({ media, onDelete }: ScreenshotGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [signedUrls, setSignedUrls] = useState<Record<string, { url: string; expiresAtMs: number }>>({});

  useEffect(() => {
    if (!media || media.length === 0) return;

    let cancelled = false;

    (async () => {
      const now = Date.now();
      for (const item of media) {
        const cached = signedUrls[item.id];
        if (cached && cached.expiresAtMs - now > 30_000) continue;

        const result = await createTradeScreenshotSignedUrl(item.path, 3600);
        if (cancelled) return;
        if (!result?.signedUrl) continue;

        setSignedUrls((prev) => ({
          ...prev,
          [item.id]: { url: result.signedUrl, expiresAtMs: result.expiresAtMs },
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // signedUrls intentionally omitted to avoid infinite loops; we refresh opportunistically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  if (!media || media.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <p className="text-sm">No screenshots yet</p>
        <p className="text-xs mt-1">Upload screenshots to document your trade</p>
      </Card>
    );
  }

  const handleThumbnailClick = (index: number) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % media.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + media.length) % media.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'Escape') setLightboxOpen(false);
  };

  const currentMedia = media[currentIndex];
  const currentUrl = currentMedia ? signedUrls[currentMedia.id]?.url : null;

  return (
    <>
      {/* Thumbnail Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {media.map((item, index) => (
          <div key={item.id} className="relative group">
            <Card
              className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all aspect-video"
              onClick={() => handleThumbnailClick(index)}
            >
              {signedUrls[item.id]?.url ? (
                <img
                  src={signedUrls[item.id].url}
                  alt={`Screenshot ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted/30" />
              )}
            </Card>
            <Button
              size="icon"
              variant="destructive"
              className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-0 text-white"
          onKeyDown={handleKeyDown}
        >
          <div className="relative flex items-center justify-center h-[95vh]">
            {/* Delete button */}
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-4 right-16 z-10 text-white hover:bg-red-500/50"
              onClick={() => {
                onDelete(currentMedia.id);
                if (media.length === 1) {
                  setLightboxOpen(false);
                } else if (currentIndex >= media.length - 1) {
                  setCurrentIndex(Math.max(0, currentIndex - 1));
                }
              }}
            >
              <Trash2 className="w-6 h-6" />
            </Button>

            {/* Previous button */}
            {media.length > 1 && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute left-4 z-10 text-white hover:bg-white/20"
                onClick={handlePrev}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>
            )}

            {/* Next button */}
            {media.length > 1 && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-4 z-10 text-white hover:bg-white/20"
                onClick={handleNext}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            )}

            {/* Image */}
            {currentUrl ? (
              <img
                src={currentUrl}
                alt={`Screenshot ${currentIndex + 1}`}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-white/70 text-sm">Loading…</div>
            )}

            {/* Counter */}
            {media.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
                {currentIndex + 1} / {media.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
