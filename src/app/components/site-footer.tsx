import svgPaths from '../../imports/svg-4h62f17bbh';
import { Button } from './ui/button';
import { Separator } from './ui/separator';

interface SiteFooterProps {
  onGetStarted: () => void;
  onLearnMore: () => void;
}

function scrollToSection(sectionId: string) {
  const el = document.getElementById(sectionId);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function SiteFooter({ onGetStarted, onLearnMore }: SiteFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-card/30">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-12">
        {/* Mobile: make stacking feel intentional without changing md+ layout. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10">
          <div className="sm:col-span-2 md:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <svg
                className="size-10 shrink-0 text-[#34a85a] block -translate-y-px"
                viewBox="0 0 37 44"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d={svgPaths.p20226f80} fill="currentColor" />
              </svg>
              <div className="flex flex-col leading-tight">
                <span className="text-base font-semibold leading-none tracking-tight text-foreground whitespace-nowrap">
                  <span className="text-foreground">Trade</span>{' '}
                  <span className="text-[#34a85a]">Journal</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Track. Review. Improve.
                </span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground max-w-md">
              A clean, fast journal that helps you capture context, analyze results, and build repeatable trading
              habits—without spreadsheets.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={onGetStarted} className="bg-[#34a85a] hover:bg-[#2d9450]">
                Get started
              </Button>
              <Button variant="outline" onClick={onLearnMore}>
                Learn more
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Button
                  type="button"
                  variant="link"
                  className="w-full sm:w-auto justify-start px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => scrollToSection('features')}
                >
                  Features
                </Button>
              </li>
              <li>
                <Button
                  type="button"
                  variant="link"
                  className="w-full sm:w-auto justify-start px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => scrollToSection('workflow')}
                >
                  How it works
                </Button>
              </li>
              <li>
                <Button
                  type="button"
                  variant="link"
                  className="w-full sm:w-auto justify-start px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => scrollToSection('pricing')}
                >
                  Pricing
                </Button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Button
                  type="button"
                  variant="link"
                  className="w-full sm:w-auto justify-start px-0 text-muted-foreground hover:text-foreground"
                  onClick={onLearnMore}
                >
                  Guides & FAQs
                </Button>
              </li>
              <li>
                <Button
                  type="button"
                  variant="link"
                  className="w-full sm:w-auto justify-start px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => window.dispatchEvent(new Event('open-subscription-dialog'))}
                >
                  Compare plans
                </Button>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8 sm:my-10" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© {year} Trade Journal. All rights reserved.</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <button
              type="button"
              className="hover:text-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => scrollToSection('top')}
            >
              Back to top
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
