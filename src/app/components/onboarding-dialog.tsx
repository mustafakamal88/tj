import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { getSupabaseClient } from '../utils/supabase';
import { cn } from './ui/utils';

const CHALLENGE_OPTIONS = [
  'Overtrading',
  'Revenge trading',
  'Breaking rules / no discipline',
  'Cutting winners / holding losers',
  'Fear after losses',
  'Inconsistent strategy',
  'Poor risk management',
] as const;

interface OnboardingDialogProps {
  open: boolean;
  userId: string;
  onCompleted: () => void;
}

export function OnboardingDialog({ open, userId, onCompleted }: OnboardingDialogProps) {
  const supabase = getSupabaseClient();
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedChallenge(null);
    setSubmitting(false);
  }, [open]);

  const options = useMemo(() => Array.from(CHALLENGE_OPTIONS), []);

  const handleContinue = async () => {
    if (!supabase || !selectedChallenge || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          primary_challenge: selectedChallenge,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;
      onCompleted();
    } catch (error) {
      console.error('[onboarding] failed to save challenge', error);
      toast.error('Failed to save. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What usually hurts your trading the most?</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {options.map((option) => {
            const selected = selectedChallenge === option;
            return (
              <Button
                key={option}
                type="button"
                variant="outline"
                className={cn(
                  'h-auto min-h-11 justify-start whitespace-normal text-left leading-snug',
                  selected ? 'border-[#34a85a] bg-[#34a85a]/10' : '',
                )}
                onClick={() => setSelectedChallenge(option)}
              >
                {option}
              </Button>
            );
          })}
        </div>

        <Button
          className="w-full bg-[#34a85a] hover:bg-[#2d9450]"
          disabled={!selectedChallenge || submitting}
          onClick={() => void handleContinue()}
        >
          Continue
        </Button>
      </DialogContent>
    </Dialog>
  );
}
