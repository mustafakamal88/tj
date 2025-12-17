import { TrendingUp, LayoutDashboard, BookOpen, BarChart3, Menu, X, LogOut, User, CreditCard, Lock, GraduationCap } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';
import type { Page } from '../App';
import { ThemeToggle } from './theme-toggle';
import svgPaths from '../../imports/svg-4h62f17bbh';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface NavigationProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  user: string | null;
  onAuthClick: () => void;
  onLogout: () => void;
  onSubscriptionClick: () => void;
}

export function Navigation({ currentPage, onNavigate, user, onAuthClick, onLogout, onSubscriptionClick }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'home' as Page, label: 'Home', icon: TrendingUp },
    { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard, protected: true },
    { id: 'journal' as Page, label: 'Journal', icon: BookOpen, protected: true },
    { id: 'analytics' as Page, label: 'Analytics', icon: BarChart3, protected: true },
    { id: 'learn' as Page, label: 'Learn More', icon: GraduationCap },
  ];

  return (
<<<<<<< HEAD
    <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('home')}>
            <svg width="40" height="40" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d={svgPaths.p20226f80} fill="#34a85a"/>
            </svg>
            <span className="font-bold text-lg text-foreground">Trade Journal</span>
          </div>
=======
    <nav className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <button
            type="button"
            className="flex items-center gap-2.5 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => onNavigate('home')}
            aria-label="Go to home"
          >
            <svg
              className="size-10 sm:size-11 shrink-0 text-[#34a85a] block -translate-y-px"
              viewBox="0 0 37 44"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d={svgPaths.p20226f80} fill="currentColor" />
            </svg>
            <span className="text-base sm:text-lg font-semibold leading-none tracking-tight text-foreground whitespace-nowrap">
              <span className="text-foreground">Trade</span>{' '}
              <span className="text-[#34a85a]">Journal</span>
            </span>
          </button>
>>>>>>> f8d36ea (Initial commit)

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isProtected = item.protected && !user;
<<<<<<< HEAD
              return (
                <Button
                  key={item.id}
                  variant={currentPage === item.id ? 'default' : 'ghost'}
=======
              const isActive = currentPage === item.id;
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  size="sm"
>>>>>>> f8d36ea (Initial commit)
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileMenuOpen(false);
                  }}
<<<<<<< HEAD
                  className={`gap-2 ${currentPage === item.id ? 'bg-[#34a85a] hover:bg-[#2d9450] text-white' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {isProtected && <Lock className="w-3 h-3 text-muted-foreground" />}
=======
                  aria-current={isActive ? 'page' : undefined}
                  className={`gap-2 ${
                    isActive
                      ? 'bg-[#34a85a] hover:bg-[#2d9450] text-white'
                      : 'text-foreground/80 hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 hidden lg:block" />
                  {item.label}
                  {isProtected && <Lock className="w-3 h-3 opacity-70" />}
>>>>>>> f8d36ea (Initial commit)
                </Button>
              );
            })}
          </div>

          {/* Right Side Actions */}
          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <User className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>My Account</span>
                      <span className="text-xs font-normal text-muted-foreground">{user}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSubscriptionClick}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Subscription
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
<<<<<<< HEAD
              <Button onClick={onAuthClick} className="bg-[#34a85a] hover:bg-[#2d9450]">Login</Button>
=======
              <>
                <Button variant="ghost" onClick={onAuthClick}>
                  Log in
                </Button>
                <Button onClick={onAuthClick} className="bg-[#34a85a] hover:bg-[#2d9450]">
                  Get started
                </Button>
              </>
>>>>>>> f8d36ea (Initial commit)
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
<<<<<<< HEAD
=======
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
>>>>>>> f8d36ea (Initial commit)
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
<<<<<<< HEAD
                return (
                  <Button
                    key={item.id}
                    variant={currentPage === item.id ? 'default' : 'ghost'}
=======
                const isProtected = item.protected && !user;
                const isActive = currentPage === item.id;
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
>>>>>>> f8d36ea (Initial commit)
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
<<<<<<< HEAD
                    className={`gap-2 justify-start ${currentPage === item.id ? 'bg-[#34a85a] hover:bg-[#2d9450] text-white' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
=======
                    aria-current={isActive ? 'page' : undefined}
                    className={`gap-2 justify-start ${
                      isActive
                        ? 'bg-[#34a85a] hover:bg-[#2d9450] text-white'
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                    {isProtected && <Lock className="w-3 h-3 opacity-70" />}
>>>>>>> f8d36ea (Initial commit)
                  </Button>
                );
              })}
              
              <div className="border-t mt-2 pt-2">
                {user ? (
                  <>
                    <div className="px-4 py-2 text-sm text-muted-foreground">
                      {user}
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        onSubscriptionClick();
                        setMobileMenuOpen(false);
                      }}
                      className="gap-2 justify-start w-full"
                    >
                      <CreditCard className="w-4 h-4" />
                      Subscription
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        onLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="gap-2 justify-start w-full"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </Button>
                  </>
                ) : (
<<<<<<< HEAD
                  <Button
                    onClick={() => {
                      onAuthClick();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-[#34a85a] hover:bg-[#2d9450]"
                  >
                    Login
                  </Button>
=======
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        onAuthClick();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full"
                    >
                      Log in
                    </Button>
                    <Button
                      onClick={() => {
                        onAuthClick();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full bg-[#34a85a] hover:bg-[#2d9450]"
                    >
                      Get started
                    </Button>
                  </div>
>>>>>>> f8d36ea (Initial commit)
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
<<<<<<< HEAD
}
=======
}
>>>>>>> f8d36ea (Initial commit)
