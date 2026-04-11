import { motion } from "framer-motion";
import { type ReactNode } from "react";
import { pageTransition } from "@/lib/motion";

/**
 * Wraps a page's content in a subtle fade+slide transition.
 * Only 180ms in, 100ms out — the app should never feel slow.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={pageTransition}
      initial="hidden"
      animate="show"
      exit="exit"
      // overflow-y-auto here is the default scroll behavior for pages
      // that don't manage their own height. SearchPage and ChatContainer
      // explicitly set overflow-hidden on their outer wrapper so this
      // scroll never engages for them — the inner results/messages
      // column handles its own scroll instead.
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto"
    >
      {children}
    </motion.div>
  );
}
