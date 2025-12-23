import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { AlertCircle, TrendingUp } from 'lucide-react';
import type { DayNews } from '../utils/day-journal-api';

type DayNewsBlockProps = {
  news: DayNews[];
};

export function DayNewsBlock({ news }: DayNewsBlockProps) {
  if (!news || news.length === 0) {
    return (
      <Card className="p-4 text-center text-muted-foreground">
        <p className="text-xs">No news for this day</p>
        <p className="text-xs mt-1 text-muted-foreground/70">
          News data coming soon
        </p>
      </Card>
    );
  }

  // Filter to show only high-impact news and USD/Gold related
  const importantNews = news.filter(
    (item) =>
      item.impact === 'high' ||
      item.currency === 'USD' ||
      item.currency === 'XAU' ||
      item.title.toLowerCase().includes('gold') ||
      item.title.toLowerCase().includes('fed')
  );

  const displayNews = importantNews.length > 0 ? importantNews : news.slice(0, 5);

  return (
    <div className="space-y-2">
      {displayNews.map((item) => (
        <Card key={item.id} className="p-3">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-0.5">
              {item.impact === 'high' ? (
                <AlertCircle className="w-4 h-4 text-red-500" />
              ) : (
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-1">
                {item.currency && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {item.currency}
                  </Badge>
                )}
                {item.impact && (
                  <Badge
                    variant={item.impact === 'high' ? 'destructive' : 'secondary'}
                    className="text-[10px] px-1 py-0"
                  >
                    {item.impact}
                  </Badge>
                )}
                {item.time && (
                  <span className="text-[10px] text-muted-foreground">{item.time}</span>
                )}
              </div>
              <p className="text-xs leading-tight">{item.title}</p>
              {item.source && (
                <p className="text-[10px] text-muted-foreground mt-1">{item.source}</p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
