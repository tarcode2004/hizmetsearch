import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Thin primary-color progress bar at the top of the viewport that
 * animates on every route change. Reads as "the app is working."
 */
export function NavProgress() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 450);
    return () => clearTimeout(timer);
  }, [location.pathname, location.search]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`${location.pathname}${location.search}`}
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] origin-left bg-primary"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            scaleX: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
            opacity: { duration: 0.2 },
          }}
        />
      )}
    </AnimatePresence>
  );
}
