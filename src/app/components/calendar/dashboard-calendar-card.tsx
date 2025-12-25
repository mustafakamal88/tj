import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { formatCurrency } from '../../utils/trade-calculations';
import { pnlBgSoftClass, pnlTextClass } from '../../utils/semantic-colors';

type CalendarDayData = {
  count: number;
  pnl: number;
  isClosed: boolean;
} | null;

type CalendarWeekData = {
  pnl: number;
  days: number;
};

export type DashboardCalendarCardProps = {
  currentMonth: Date;
  weeks: Date[][];
  getDayData: (day: Date) => CalendarDayData;
  getWeekData: (week: Date[]) => CalendarWeekData;
  isToday: (day: Date) => boolean;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onDayClick?: (day: Date) => void;
  onGoToDate?: (day: Date) => void;
  preview?: boolean;
  hideWeekends?: boolean;
};

export function DashboardCalendarCard({
  currentMonth,
  weeks,
  getDayData,
  getWeekData,
  isToday,
  onPrevMonth,
  onNextMonth,
  onDayClick,
  onGoToDate,
  preview = false,
  hideWeekends = false,
}: DashboardCalendarCardProps) {
  const [goToDate, setGoToDate] = useState('');
  const showHideWeekends = !preview && hideWeekends;
  const visibleDayIndexes = showHideWeekends ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  const dayHeaders = showHideWeekends
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Week']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Week'];

  const handleGoToDate = () => {
    if (!goToDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(goToDate)) {
      toast.error('Enter a valid date');
      return;
    }
    const parsed = parseISO(goToDate);
    if (!Number.isFinite(parsed.getTime())) {
      toast.error('Enter a valid date');
      return;
    }

    if (onGoToDate) {
      onGoToDate(parsed);
      return;
    }
    if (onDayClick) {
      onDayClick(parsed);
    }
  };

  return (
    <Card className="p-4 sm:p-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">TODAY</span>
          <span className="text-muted-foreground">-</span>
          <h2>{format(currentMonth, 'MMMM yyyy')}</h2>
        </div>
        {!preview && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="Go to date"
                value={goToDate}
                onChange={(e) => setGoToDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleGoToDate();
                  }
                }}
                className="w-[160px]"
              />
              <Button variant="outline" onClick={handleGoToDate} disabled={!goToDate} aria-label="Go to date">
                Go
              </Button>
            </div>
            <Button variant="outline" size="icon" onClick={onPrevMonth} disabled={!onPrevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={onNextMonth} disabled={!onNextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Calendar Grid */}
      <div
        className={
          preview
            ? 'overflow-hidden overflow-y-hidden'
            : 'overflow-x-auto overflow-y-hidden -mx-4 px-4 sm:mx-0 sm:px-0'
        }
      >
        <div className={preview ? 'flex justify-end' : ''}>
          <div className="w-full min-w-[800px]">
            {/* Day Headers */}
            <div
              className={
                showHideWeekends
                  ? 'grid grid-cols-6 gap-0 mb-2 [grid-template-columns:repeat(5,minmax(0,1fr))_120px]'
                  : 'grid grid-cols-8 gap-0 mb-2 [grid-template-columns:repeat(7,minmax(0,1fr))_120px]'
              }
            >
              {dayHeaders.map((day) => (
                <div key={day} className="text-center text-[10px] sm:text-sm text-muted-foreground py-1.5 sm:py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Rows */}
            <div className="border rounded-lg overflow-hidden">
              {weeks.map((week, weekIndex) => {
                const weekData = getWeekData(week);
                return (
                  <div
                    key={weekIndex}
                    className={
                      showHideWeekends
                        ? 'grid grid-cols-6 gap-0 [grid-template-columns:repeat(5,minmax(0,1fr))_120px]'
                        : 'grid grid-cols-8 gap-0 [grid-template-columns:repeat(7,minmax(0,1fr))_120px]'
                    }
                  >
                    {/* Day Cells */}
                    {visibleDayIndexes.map((dayIndex) => {
                      const day = week[dayIndex] ?? new Date(0);
                      const dayData = getDayData(day);
                      const isEmpty = day.getTime() === 0;
                      const isClickable = !preview && !isEmpty && onDayClick;
                      const interactive = isClickable ? 'hover:bg-accent cursor-pointer' : '';

                      const handleDayClick = () => {
                        if (isClickable) {
                          onDayClick(day);
                        }
                      };

                      const handleKeyDown = (e: React.KeyboardEvent) => {
                        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onDayClick(day);
                        }
                      };

                      return (
                        <button
                          key={dayIndex}
                          onClick={handleDayClick}
                          onKeyDown={handleKeyDown}
                          disabled={!isClickable}
                          className={`
                            border-b border-r p-1 sm:p-4 aspect-square sm:aspect-auto sm:min-h-[100px] flex flex-col min-w-0 overflow-hidden
                            ${isEmpty ? 'bg-muted/20' : ''}
                            ${!isEmpty && dayData && !dayData.isClosed && !isToday(day) ? pnlBgSoftClass(dayData.pnl) : ''}
                            ${isToday(day) ? 'bg-blue-50 dark:bg-blue-950/20' : ''}
                            ${interactive}
                            ${isClickable ? 'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset' : ''}
                            disabled:cursor-default
                          `}
                        >
                          {!isEmpty && (
                            <>
                              {/* Date */}
                              <div className="text-[10px] sm:text-sm text-muted-foreground mb-1 sm:mb-2 leading-none">
                                {format(day, 'd')}
                              </div>

                              {/* P&L */}
                              <div className="flex-1 min-h-0 flex items-center justify-center">
                                {dayData?.isClosed ? (
                                  <span className="text-sm sm:text-2xl text-muted-foreground leading-none">—</span>
                                ) : (
                                  <span
                                    className={`block w-full text-center whitespace-nowrap text-[11px] sm:text-xl font-medium tabular-nums leading-tight ${pnlTextClass(dayData?.pnl)}`}
                                  >
                                    {dayData && formatCurrency(dayData.pnl).replace('.00', '')}
                                  </span>
                                )}
                              </div>

                              {/* Trade Count */}
                              <div className="w-full truncate whitespace-nowrap text-[10px] sm:text-xs text-center text-muted-foreground mt-1 sm:mt-2 leading-tight">
                                {dayData?.isClosed ? (
                                  'Closed'
                                ) : (
                                  <>
                                    {dayData?.count} {dayData?.count === 1 ? 'trade' : 'trades'}
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </button>
                      );
                    })}

                    {/* Week Summary Cell */}
                    <div className="border-b p-2 sm:p-4 min-h-0 sm:min-h-[100px] flex flex-col items-center justify-center bg-muted/30 min-w-0 overflow-hidden">
                      <div className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2 leading-none">
                        Week {weekIndex + 1}
                      </div>
                      {weekData.days > 0 ? (
                        <>
                          <div
                            className={`text-sm sm:text-xl font-medium tabular-nums whitespace-nowrap ${pnlTextClass(weekData.pnl)}`}
                          >
                            {formatCurrency(weekData.pnl).replace('.00', '')}
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2 leading-tight whitespace-nowrap">
                            {weekData.days} {weekData.days === 1 ? 'day' : 'days'}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm sm:text-xl text-muted-foreground leading-none">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {!preview && (
        <>
          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-600"></div>
              <span>Profit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-600"></div>
              <span>Loss</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border-2"></div>
              <span>Closed</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
