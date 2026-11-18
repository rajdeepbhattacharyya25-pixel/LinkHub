import React, { useState } from 'react';
import {
  ArrowLeft,
  Send,
  X,
  Copy,
  Check,
  BookOpen,
} from 'lucide-react';
import {
  validateContactSubmission,
  validateUpdateSubscription,
  type ValidationResult,
} from '../utils/hubLogic';
import type {
  ProfileConfig,
  BlogPost,
} from '../data/profileData';
import {
  DEFAULT_OG_LOGO_PATH,
  DEFAULT_PUBLIC_URL_PATH,
  DEFAULT_PUBLIC_URL_SLUG,
} from '../utils/seoAndGeo';
import { WebsiteBrandLogo } from './SocialIcons';

export interface StoredMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  source: 'hub' | 'work' | 'custom';
  timestamp: string;
  read?: boolean;
}

/* ============================================================================
 * 1. WORK WITH ME VIEW
 * ========================================================================== */
export const WorkWithMeView: React.FC<{
  profile: ProfileConfig;
  avatarUrl: string;
  onBack: () => void;
  onSubmitMessage: (msg: Omit<StoredMessage, 'id' | 'timestamp'>) => Promise<void> | void;
}> = ({ profile, avatarUrl, onBack, onSubmitMessage }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ValidationResult['errors']>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const displayName = profile.name.trim() || 'Link Hub';
  const displayHandle = profile.handle.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    const res = validateContactSubmission({ name, email, message });
    if (!res.valid) {
      setErrors(res.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmitMessage({ name: name.trim(), email: email.trim(), message: message.trim(), source: 'work' });
      setSubmitted(true);
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setSubmitError('Unable to send your request right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen flex items-start sm:items-center justify-center px-3 sm:px-4 pt-4 sm:py-16 pb-28 sm:pb-16">
      <main className="w-full max-w-[540px] rounded-3xl bg-card-paper border border-[#D5C4AE] p-5 sm:p-8 shadow-[0_24px_60px_-15px_rgba(26,18,14,0.45)] space-y-5 sm:space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-3 min-h-[44px] text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4A2E] rounded-xl px-2 py-1 -ml-2"
        >
          <ArrowLeft className="w-4 h-4 text-[#6B4A2E] group-hover:-translate-x-0.5 transition-transform" />
          <img
            src={avatarUrl}
            alt={displayName}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover border border-[#A88462]"
          />
          <div>
            <div className="text-xs font-bold text-[#1A120E]">{displayName}</div>
            {displayHandle && (
              <div className="text-[11px] text-[#6B4A2E] font-mono">{displayHandle}</div>
            )}
          </div>
        </button>

        <h1 className="text-2xl font-bold text-[#1A120E] tracking-tight">Work with me</h1>

        <section aria-labelledby="send-request-heading" className="space-y-4">
          <h2 id="send-request-heading" className="text-xs font-semibold text-[#6B4A2E]">
            Send a request
          </h2>

          {submitted && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#A88462] text-xs text-[#1A120E] flex items-center justify-between"
            >
              <span>Request received! I will get back to you at your email shortly.</span>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-[11px] font-semibold text-[#6B4A2E] underline ml-2 cursor-pointer"
              >
                Send another
              </button>
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-300 text-xs text-red-900 font-medium"
            >
              {submitError}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            noValidate
            toolname="send_work_inquiry"
            tooldescription="Submit a work, hackathon, or project collaboration inquiry to the site owner."
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label htmlFor="work-name" className="block text-[13px] sm:text-xs font-bold text-[#1A120E]">
                Your name <span className="text-[#6B4A2E]">*</span>
              </label>
              <input
                id="work-name"
                name="name"
                type="text"
                required
                toolparamdescription="Sender's full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#B89B7E] focus:border-[#3A2418] focus:ring-2 focus:ring-[#A88462]/25 focus:outline-none text-[12.5px] sm:text-xs font-medium text-[#1A120E] placeholder-[#5C3D24] transition-all"
              />
              {errors.name && <p className="text-[11px] text-[#3A2418] font-semibold">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="work-email" className="block text-[13px] sm:text-xs font-bold text-[#1A120E]">
                Your email <span className="text-[#6B4A2E]">*</span>
              </label>
              <input
                id="work-email"
                name="email"
                type="email"
                required
                toolparamdescription="Sender's email address for follow-up"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#B89B7E] focus:border-[#3A2418] focus:ring-2 focus:ring-[#A88462]/25 focus:outline-none text-[12.5px] sm:text-xs font-medium text-[#1A120E] placeholder-[#5C3D24] transition-all"
              />
              {errors.email && <p className="text-[11px] text-[#3A2418] font-semibold">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="work-message" className="block text-[13px] sm:text-xs font-bold text-[#1A120E]">
                Message <span className="text-[#6B4A2E]">*</span>
              </label>
              <textarea
                id="work-message"
                name="message"
                rows={3}
                required
                toolparamdescription="Project scope, collaboration details, or message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#B89B7E] focus:border-[#3A2418] focus:ring-2 focus:ring-[#A88462]/25 focus:outline-none text-[12.5px] sm:text-xs font-medium text-[#1A120E] placeholder-[#5C3D24] transition-all resize-none"
              />
              {errors.message && <p className="text-[11px] text-[#3A2418] font-semibold">{errors.message}</p>}
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A120E] hover:bg-[#3A2418] text-[#FAF6F0] text-sm sm:text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
};

/* ============================================================================
 * 2. POSTS VIEW
 * ========================================================================== */
export const PostsView: React.FC<{
  profile: ProfileConfig;
  avatarUrl: string;
  posts?: BlogPost[];
  onBack: () => void;
}> = ({ profile, avatarUrl, posts = [], onBack }) => {
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const displayName = profile.name.trim() || 'Link Hub';
  const displayHandle = profile.handle.trim();

  return (
    <div className="relative z-10 min-h-screen flex items-start sm:items-center justify-center px-3 sm:px-4 pt-4 sm:py-16 pb-28 sm:pb-16">
      <main className="w-full max-w-[560px] rounded-3xl bg-card-paper border border-[#D5C4AE] p-5 sm:p-8 shadow-[0_24px_60px_-15px_rgba(26,18,14,0.45)] space-y-5 sm:space-y-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => (activePost ? setActivePost(null) : onBack())}
            className="inline-flex items-center gap-3 min-h-[44px] text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4A2E] rounded-xl px-2 py-1 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 text-[#6B4A2E] group-hover:-translate-x-0.5 transition-transform" />
            <img
              src={avatarUrl}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-[#A88462]"
            />
            <div>
              <div className="text-xs font-bold text-[#1A120E]">{displayName}</div>
              {displayHandle && (
                <div className="text-[11px] text-[#6B4A2E] font-mono">{displayHandle}</div>
              )}
            </div>
          </button>

          {activePost && (
            <button
              type="button"
              onClick={() => setActivePost(null)}
              className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-[#6B4A2E] hover:text-[#1A120E] transition-colors cursor-pointer"
            >
              All posts
            </button>
          )}
        </div>

        {!activePost ? (
          <>
            <h1 className="text-2xl font-bold text-[#1A120E] tracking-tight">Posts</h1>

            {posts.length === 0 ? (
              <p className="text-xs text-[#6B4A2E] p-4 rounded-2xl bg-[#FAF6F0] border border-[#D5C4AE]">
                No posts published yet. You can add posts from the Admin workspace.
              </p>
            ) : (
              <ul className="space-y-3">
                {posts.map((post) => (
                  <li key={post.slug}>
                    <button
                      type="button"
                      onClick={() => setActivePost(post)}
                      className="w-full text-left p-4 rounded-2xl bg-[#FAF6F0] border border-[#D5C4AE] hover:border-[#A88462] shadow-2xs transition-all space-y-2 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#1A120E] group-hover:text-[#6B4A2E] transition-colors">
                          {post.title}
                        </span>
                        <BookOpen className="w-3.5 h-3.5 text-[#6B4A2E] shrink-0 opacity-75 group-hover:opacity-100" />
                      </div>
                      <p className="text-xs text-[#3A2418]/85 leading-relaxed line-clamp-2">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-[#6B4A2E] font-mono">
                        <span>{post.date}</span>
                        <span aria-hidden="true">·</span>
                        <span>{post.readTime}</span>
                        <span aria-hidden="true">·</span>
                        <span>{post.category}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <article className="space-y-4 pt-1">
            <div className="space-y-2 border-b border-[#D5C4AE] pb-4">
              <div className="flex items-center gap-2 text-[11px] text-[#6B4A2E] font-mono">
                <span>{activePost.date}</span>
                <span aria-hidden="true">·</span>
                <span>{activePost.readTime}</span>
                <span aria-hidden="true">·</span>
                <span>{activePost.category}</span>
              </div>
              <h1 className="text-xl font-bold text-[#1A120E] tracking-tight">
                {activePost.title}
              </h1>
            </div>

            <div className="space-y-3.5 text-xs sm:text-sm text-[#3A2418] leading-relaxed">
              {activePost.content.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </article>
        )}
      </main>
    </div>
  );
};

/* ============================================================================
 * 3. GET UPDATES MODAL
 * ========================================================================== */
export const GetUpdatesModal: React.FC<{
  profileName: string;
  onClose: () => void;
  onSubscribe: (name: string, email: string) => Promise<void> | void;
}> = ({ profileName, onClose, onSubscribe }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const check = validateUpdateSubscription(email);
    if (!check.valid) {
      setError(check.error || 'Invalid email');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubscribe(name.trim(), email.trim());
      setDone(true);
    } catch {
      setError('Unable to subscribe right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1A120E]/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="get-updates-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm rounded-t-3xl rounded-b-none sm:rounded-3xl bg-[#F4EDE2] border-t sm:border border-[#D5C4AE] p-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:p-6 shadow-2xl space-y-4 relative"
      >
        <div className="w-10 h-1 rounded-full bg-[#B89B7E]/80 mx-auto sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 id="get-updates-title" className="text-base font-bold text-[#1A120E]">
            Get updates
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-[#EAE0D3] text-[#3A2418] hover:bg-[#D5C4AE] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#3A2418]/85">
          Be the first to know when{' '}
          {profileName.trim() ? `${profileName.trim()}’s page` : 'this hub'} is updated.
        </p>

        {done ? (
          <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#A88462] space-y-2 text-center">
            <p className="text-xs font-bold text-[#1A120E]">You are subscribed!</p>
            <p className="text-[11px] text-[#3A2418]">
              Updates will be sent to <span className="font-mono text-[#6B4A2E]">{email}</span>.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            toolname="subscribe_updates"
            tooldescription="Subscribe to project releases and developer updates from the Link Hub owner."
            className="space-y-3"
          >
            <div>
              <label htmlFor="sub-name" className="sr-only">
                Name (optional)
              </label>
              <input
                id="sub-name"
                name="name"
                type="text"
                toolparamdescription="Subscriber's optional display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full h-10 px-3.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#B89B7E] focus:border-[#3A2418] focus:ring-2 focus:ring-[#A88462]/25 focus:outline-none text-[12.5px] sm:text-xs font-medium text-[#1A120E] placeholder-[#5C3D24]"
              />
            </div>

            <div>
              <label htmlFor="sub-email" className="sr-only">
                Email
              </label>
              <input
                id="sub-email"
                name="email"
                type="email"
                required
                toolparamdescription="Subscriber's email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-10 px-3.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#B89B7E] focus:border-[#3A2418] focus:ring-2 focus:ring-[#A88462]/25 focus:outline-none text-[12.5px] sm:text-xs font-medium text-[#1A120E] placeholder-[#5C3D24]"
              />
              {error && <p className="text-[11px] text-[#3A2418] font-semibold mt-1">{error}</p>}
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] py-2.5 rounded-xl bg-[#1A120E] hover:bg-[#3A2418] text-[#FAF6F0] text-sm sm:text-xs font-semibold transition-colors cursor-pointer"
            >
              Continue
            </button>

            <p className="text-[11px] text-center font-medium text-[#3A2418]">
              No spam. Unsubscribe anytime.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. SHARE PROFILE / PASS MODAL
 * ========================================================================== */
export const ShareModal: React.FC<{
  handle?: string;
  onClose: () => void;
}> = ({ onClose }) => {
  const [shareTarget, setShareTarget] = useState<'profile' | 'pass'>('profile');
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const baseUrl = `${origin}${DEFAULT_PUBLIC_URL_PATH}`;
  const shareUrl = shareTarget === 'profile' ? baseUrl : `${baseUrl}#pass`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(shareUrl).catch(() => { });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1A120E]/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl rounded-b-none sm:rounded-3xl bg-[#F4EDE2] border-t sm:border border-[#D5C4AE] p-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:p-6 shadow-2xl space-y-4"
      >
        <div className="w-10 h-1 rounded-full bg-[#B89B7E]/80 mx-auto sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WebsiteBrandLogo className="w-6 h-6 shrink-0" />
            <h2 id="share-dialog-title" className="text-base font-bold text-[#1A120E]">
              Share {DEFAULT_PUBLIC_URL_SLUG}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-[#EAE0D3] text-[#3A2418] hover:bg-[#D5C4AE] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Radio group for Profile vs Pass */}
        <div
          role="radiogroup"
          aria-label="Link to share"
          className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#EAE0D3] border border-[#D5C4AE]"
        >
          <button
            type="button"
            role="radio"
            aria-checked={shareTarget === 'profile'}
            onClick={() => setShareTarget('profile')}
            className={`min-h-[42px] sm:min-h-0 py-2 sm:py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${shareTarget === 'profile'
              ? 'bg-[#3A2418] text-[#FAF6F0] shadow-xs'
              : 'text-[#6B4A2E] hover:text-[#1A120E]'
              }`}
          >
            Profile
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={shareTarget === 'pass'}
            onClick={() => setShareTarget('pass')}
            className={`min-h-[42px] sm:min-h-0 py-2 sm:py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${shareTarget === 'pass'
              ? 'bg-[#3A2418] text-[#FAF6F0] shadow-xs'
              : 'text-[#6B4A2E] hover:text-[#1A120E]'
              }`}
          >
            Pass
          </button>
        </div>

        {/* Live Chat Share Card Preview */}
        <div
          data-testid="chat-share-card-preview"
          className="rounded-2xl overflow-hidden border border-[#D5C4AE] bg-[#FAF6F0] shadow-xs"
        >
          <div className="relative aspect-[16/9] w-full bg-[#3A2418] overflow-hidden">
            <img
              src={DEFAULT_OG_LOGO_PATH}
              alt={`${DEFAULT_PUBLIC_URL_SLUG} chat share logo preview`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A120E]/85 text-[#FAF6F0] text-[10px] font-mono font-semibold tracking-wide backdrop-blur-xs">
              <WebsiteBrandLogo className="w-3.5 h-3.5" />
              <span>Chat Preview</span>
            </span>
          </div>
          <div className="p-3 space-y-1">
            <div className="text-[10.5px] font-mono font-semibold text-[#6B4A2E] truncate">
              {DEFAULT_PUBLIC_URL_SLUG}
            </div>
            <div className="text-xs font-bold text-[#1A120E] leading-snug">
              {shareTarget === 'pass'
                ? `Digital Pass — ${DEFAULT_PUBLIC_URL_SLUG}`
                : `${DEFAULT_PUBLIC_URL_SLUG} — Personal Portfolio & Link Studio`}
            </div>
            <p className="text-[11px] text-[#3A2418]/85 line-clamp-2 leading-relaxed">
              Personal link hub, portfolio card, interactive pass, and developer workspace.
            </p>
          </div>
        </div>

        {/* Copy URL box */}
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FAF6F0] border border-[#D5C4AE]">
          <span className="text-xs font-mono text-[#1A120E] truncate pl-1">{shareUrl}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[42px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-lg bg-[#3A2418] text-[#FAF6F0] text-xs font-semibold hover:bg-[#6B4A2E] transition-colors shrink-0 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

