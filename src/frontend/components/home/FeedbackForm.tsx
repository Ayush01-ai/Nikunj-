'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle, Star } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import type { Testimonial } from '@/types';

const feedbackSchema = z.object({
  name: z.string().min(2, 'Name required').max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  rating: z.string().min(1, 'Please select a rating'),
  product: z.string().max(100).optional(),
  message: z.string().min(10, 'Please write at least 10 characters').max(500),
  website: z.string().optional(),
});

type FeedbackFormData = z.infer<typeof feedbackSchema>;

interface FeedbackFormProps {
  reviews?: Testimonial[];
  showReviews?: boolean;
  showForm?: boolean;
}

const REVIEWS_PREVIEW = 6;

export function FeedbackForm({ reviews = [], showReviews = true, showForm = true }: FeedbackFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showAllReviews, setShowAllReviews] = useState(false);
  // Password-manager extensions (e.g. LastPass) inject nodes into SSR'd inputs before hydration.
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackSchema),
  });

  const selectedRating = Number(watch('rating') || 0);

  const onSubmit = async (data: FeedbackFormData) => {
    setSubmitError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setSubmitError(json.error || 'Could not submit your review. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    }
  };

  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, REVIEWS_PREVIEW);
  const twoColumns = showReviews && showForm;

  return (
    <section aria-labelledby="devotee-feedback-heading" className="py-20 px-4 sm:px-6 lg:px-8 bg-cream" ref={ref}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            className="font-cinzel text-xs tracking-[0.4em] uppercase text-gold block mb-3 font-semibold"
          >
            What Our Devotees Say
          </motion.span>
          <motion.h2
            id="devotee-feedback-heading"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1 }}
            className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-3 tracking-wide"
          >
            Devotee Feedback
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="font-crimson italic text-base text-[var(--text-mid)]"
          >
            Thousands of satisfied devotees across India
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3 }}
          className={`grid grid-cols-1 gap-10 items-start ${twoColumns ? 'lg:grid-cols-2' : 'max-w-xl mx-auto'}`}
        >
          {showReviews && (
          <div id="reviews" className="scroll-mt-28">
            <h3 className="font-cinzel text-sm tracking-[0.2em] uppercase text-gold-dark font-semibold mb-5 pb-3 border-b border-gold/20">
              Visible Feedback
            </h3>
            {reviews.length === 0 ? (
              <div className="bg-white/75 border border-dashed border-gold/40 p-8 text-center">
                <p className="font-crimson italic text-[var(--text-mid)]">
                  Be the first to share your experience with Nikunj Sakhi.
                </p>
              </div>
            ) : (
            <>
            <ul className="space-y-4">
            {visibleReviews.map((review) => (
              <li key={review._id}>
              <article className="bg-white/75 backdrop-blur-xs border border-gold/20 p-5 sm:p-6 shadow-xs rounded-xs">
                <div className="flex items-center gap-1 mb-3" aria-label={`${review.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={`${review._id}-${i}`}
                      aria-hidden="true"
                      className={`text-sm ${i < review.rating ? 'text-gold' : 'text-gray-300'}`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <p className="font-crimson italic text-sm text-[var(--text-mid)] leading-7 mb-4">
                  &quot;{review.review}&quot;
                </p>
                {(review.productPurchased?.name || review.productName) && (
                  <p className="font-cinzel text-xs tracking-wider text-gold-dark mb-2 font-semibold">
                    {review.productPurchased?.name || review.productName}
                  </p>
                )}
                <p className="font-lato text-xs text-deep font-semibold">
                  {review.customerName}
                  {review.location && <span className="text-[var(--text-mid)] font-normal"> · {review.location}</span>}
                  {review.isVerified && <span className="ml-2 font-normal text-green-700">✓ Verified</span>}
                </p>
              </article>
              </li>
            ))}
            </ul>
            {reviews.length > REVIEWS_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllReviews((v) => !v)}
                aria-expanded={showAllReviews}
                className="btn-outline-gold mt-5"
              >
                {showAllReviews ? 'Show fewer' : `Show all ${reviews.length} reviews`}
              </button>
            )}
            </>
            )}
          </div>
          )}

          {showForm && (
          <div id="feedback" className="scroll-mt-28">
          <h3 className="font-cinzel text-sm tracking-[0.2em] uppercase text-gold-dark font-semibold mb-5 pb-3 border-b border-gold/20">
            Share Your Feedback
          </h3>
          <div className="bg-white/80 backdrop-blur-xs border border-gold/25 p-6 sm:p-8 w-full shadow-gold-sm rounded-xs">
            {submitted ? (
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <CheckCircle size={48} className="text-gold mx-auto mb-4" />
                </motion.div>
                <h3 className="font-cinzel text-lg text-gold-dark mb-2 font-semibold">Thank You!</h3>
                <p className="font-crimson italic text-[var(--text-mid)]">
                  Your review has been received and will appear once approved. Jai Shri Krishna!
                </p>
              </div>
            ) : !isClient ? (
              <div className="min-h-[480px]" aria-hidden="true" />
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate data-lpignore="true">
                {/* Name & Phone */}
                <div className="grid grid-cols-1 gap-5">
                  <div>
                    <label className="font-cinzel text-xs tracking-wider uppercase font-semibold text-[var(--text-mid)] block mb-2">
                      Your Name *
                    </label>
                    <input
                      {...register('name')}
                      data-lpignore="true"
                      className="divine-input"
                      placeholder="Radha Devi"
                    />
                    {errors.name && (
                      <p className="text-red-500 text-xs mt-1.5">{errors.name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="font-cinzel text-xs tracking-wider uppercase font-semibold text-[var(--text-mid)] block mb-2">
                      Phone Number *
                    </label>
                    <input
                      {...register('phone')}
                      data-lpignore="true"
                      type="tel"
                      className="divine-input"
                      placeholder="9XXXXXXXXX"
                      maxLength={10}
                    />
                    {errors.phone && (
                      <p className="text-red-500 text-xs mt-1.5">{errors.phone.message}</p>
                    )}
                  </div>
                </div>

                {/* Rating */}
                <div>
                  <p id="rating-label" className="font-cinzel text-xs tracking-wider uppercase font-semibold text-[var(--text-mid)] block mb-2">
                    Rating *
                  </p>
                  <input type="hidden" {...register('rating')} />
                  <div className="flex gap-2" role="group" aria-labelledby="rating-label">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                        aria-pressed={selectedRating === star}
                        onClick={() => setValue('rating', String(star), { shouldValidate: true, shouldDirty: true })}
                        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${selectedRating >= star ? 'text-gold' : 'text-gold/60 hover:text-gold'}`}
                      >
                        <Star size={30} strokeWidth={1.5} fill={selectedRating >= star ? 'currentColor' : 'none'} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  {errors.rating && (
                    <p className="text-red-500 text-xs mt-1.5">{errors.rating.message}</p>
                  )}
                </div>

                {/* Product */}
                <div>
                  <label className="font-cinzel text-xs tracking-wider uppercase font-semibold text-[var(--text-mid)] block mb-2">
                    Product Name (optional)
                  </label>
                  <input
                    {...register('product')}
                    data-lpignore="true"
                    className="divine-input"
                    placeholder="e.g. Radha Krishna Mukut Set"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="font-cinzel text-xs tracking-wider uppercase font-semibold text-[var(--text-mid)] block mb-2">
                    Your Review *
                  </label>
                  <textarea
                    {...register('message')}
                    data-lpignore="true"
                    className="divine-input resize-none"
                    rows={4}
                    placeholder="Share your experience with our divine ornaments..."
                  />
                  {errors.message && (
                    <p className="text-red-500 text-xs mt-1.5">{errors.message.message}</p>
                  )}
                </div>

                {/* Honeypot: hidden from people, filled by bots */}
                <div className="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
                  <label>
                    Website
                    <input {...register('website')} type="text" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                {submitError && (
                  <p role="alert" className="text-red-600 text-sm font-lato">{submitError}</p>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-gold w-full py-4 text-xs font-cinzel tracking-widest uppercase cursor-pointer shadow-gold-sm hover:shadow-divine transition-all"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Review'}
                </Button>
              </form>
            )}
          </div>
          </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
