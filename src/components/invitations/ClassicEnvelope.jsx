import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'

function Particle({ initialX, initialY, color, duration }) {
  return (
    <motion.div
      initial={{ x: initialX, y: initialY, opacity: 1 }}
      animate={{
        x: initialX + (Math.random() - 0.5) * 200,
        y: initialY + 200 + Math.random() * 100,
        opacity: 0,
      }}
      transition={{ duration, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        pointerEvents: 'none',
      }}
    />
  )
}

function AmbientParticle({ index, colors }) {
  const x = Math.random() * window.innerWidth
  const y = Math.random() * window.innerHeight

  return (
    <motion.div
      initial={{ x, y, opacity: 0 }}
      animate={{ y: y - 50, opacity: [0, 0.3, 0] }}
      transition={{ duration: 4, ease: 'easeInOut', delay: index * 0.2 }}
      style={{
        position: 'fixed',
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: colors[index % colors.length],
        pointerEvents: 'none',
      }}
    />
  )
}

export default function ClassicEnvelope({ invitation, onRSVP }) {
  const [rsvpResponse, setRsvpResponse] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [playKey, setPlayKey] = useState(0)
  const confettiRef = useRef([])

  const theme = invitation.template.theme_config
  const animation = invitation.template.animation_config
  const merged = invitation.merged

  const recipientName = merged.name || merged.full_name || invitation.recipient.email

  const handleRSVP = async (response) => {
    if (submitting) return
    setSubmitting(true)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || window.location.origin
      const res = await fetch(
        `${supabaseUrl}/functions/v1/rsvp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: invitation.recipient.token,
            response: response === 'yes' ? 'rsvp_yes' : 'rsvp_no',
          }),
        }
      )

      if (!res.ok) throw new Error('Failed to save response')

      setRsvpResponse(response)
      if (onRSVP) onRSVP(response)
    } catch (err) {
      console.error('RSVP error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReplay = () => {
    setPlayKey((prev) => prev + 1)
  }

  const envelopeVariants = {
    hidden: { y: 100, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.4, ease: 'easeOut' },
    },
  }

  const flapVariants = {
    closed: { rotateX: 0 },
    open: {
      rotateX: 180,
      transition: { duration: 1.2, ease: 'easeInOut', delay: 1 },
    },
  }

  const cardVariants = {
    hidden: { y: 40, opacity: 0 },
    visible: {
      y: -60,
      opacity: 1,
      transition: { duration: 0.6, ease: 'easeOut', delay: 1.8 },
    },
  }

  const contentLineVariants = {
    hidden: { opacity: 0 },
    visible: (i) => ({
      opacity: 1,
      transition: { duration: 0.4, delay: 2.6 + i * 0.1 },
    }),
  }

  const buttonVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { duration: 0.4, ease: 'easeOut', delay: 3.5 },
    },
  }

  const replayButtonVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.3, delay: 3.8 },
    },
  }

  // Generate confetti on card reveal (around 2.4-2.8s)
  const confetti = animation.particles === 'confetti'
    ? Array.from({ length: 20 }).map((_, i) => ({
        id: i,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2 - 100,
        color: animation.particle_colors?.[i % animation.particle_colors.length] || '#4C2A92',
      }))
    : []

  return (
    <div
      key={playKey}
      style={{
        position: 'relative',
        perspective: '1000px',
        width: '100%',
        maxWidth: 500,
        margin: '0 auto',
      }}
    >
      {/* Ambient particles */}
      {animation.particles === 'stars' &&
        Array.from({ length: 5 }).map((_, i) => (
          <AmbientParticle
            key={`ambient-${i}`}
            index={i}
            colors={animation.particle_colors || ['#4C2A92', '#E8A020']}
          />
        ))}

      {/* Envelope container */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={envelopeVariants}
        style={{
          perspective: '1000px',
          marginBottom: 60,
        }}
      >
        {/* Envelope body */}
        <div
          style={{
            width: 350,
            height: 220,
            background: theme.palette.envelope_body,
            border: `2px solid ${theme.palette.accent}`,
            borderRadius: 8,
            margin: '0 auto',
            position: 'relative',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}
        >
          {/* Flap */}
          <motion.div
            variants={flapVariants}
            initial="closed"
            animate="open"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '50%',
              background: theme.palette.envelope_flap,
              transformOrigin: 'top center',
              transformStyle: 'preserve-3d',
              zIndex: 10,
            }}
          />

          {/* Card content inside envelope (hidden initially) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              width: '100%',
              height: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: theme.palette.card_bg,
            }}
          />
        </div>
      </motion.div>

      {/* Card sliding out */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        style={{
          background: theme.palette.card_bg,
          border: `2px solid ${theme.palette.accent}`,
          borderRadius: 12,
          padding: '40px 32px',
          maxWidth: 400,
          margin: '0 auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          textAlign: 'center',
        }}
      >
        {/* Recipient name */}
        <motion.div
          custom={0}
          variants={contentLineVariants}
          initial="hidden"
          animate="visible"
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: theme.palette.text_primary,
            marginBottom: 24,
          }}
        >
          {recipientName}
        </motion.div>

        {/* Event details */}
        {merged.event_date && (
          <motion.div
            custom={1}
            variants={contentLineVariants}
            initial="hidden"
            animate="visible"
            style={{
              fontSize: 14,
              color: theme.palette.text_secondary,
              marginBottom: 12,
              lineHeight: 1.6,
            }}
          >
            {merged.event_date}
            {merged.event_time && ` at ${merged.event_time}`}
          </motion.div>
        )}

        {merged.venue && (
          <motion.div
            custom={2}
            variants={contentLineVariants}
            initial="hidden"
            animate="visible"
            style={{
              fontSize: 13,
              color: theme.palette.text_secondary,
              marginBottom: 24,
            }}
          >
            {merged.venue}
          </motion.div>
        )}

        {merged.message && (
          <motion.div
            custom={3}
            variants={contentLineVariants}
            initial="hidden"
            animate="visible"
            style={{
              fontSize: 14,
              color: theme.palette.text_primary,
              marginBottom: 32,
              fontStyle: 'italic',
              lineHeight: 1.6,
            }}
          >
            "{merged.message}"
          </motion.div>
        )}

        {/* RSVP buttons */}
        {!rsvpResponse && (
          <motion.div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 32,
            }}
            variants={buttonVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.button
              type="button"
              onClick={() => handleRSVP('yes')}
              disabled={submitting}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                flex: 1,
                padding: '12px 20px',
                background: theme.palette.accent,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              Attending
            </motion.button>
            <motion.button
              type="button"
              onClick={() => handleRSVP('no')}
              disabled={submitting}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                flex: 1,
                padding: '12px 20px',
                background: theme.palette.text_secondary,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              Declining
            </motion.button>
          </motion.div>
        )}

        {rsvpResponse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              fontSize: 14,
              color: theme.palette.accent,
              fontWeight: 600,
              marginTop: 32,
            }}
          >
            Thank you for your response!
          </motion.div>
        )}
      </motion.div>

      {/* Confetti burst */}
      {confetti.map((particle) => (
        <Particle
          key={particle.id}
          initialX={particle.x}
          initialY={particle.y}
          color={particle.color}
          duration={1.4}
        />
      ))}

      {/* Replay button */}
      <motion.button
        type="button"
        onClick={handleReplay}
        variants={replayButtonVariants}
        initial="hidden"
        animate="visible"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        style={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          background: theme.palette.accent,
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '50%',
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(76, 42, 146, 0.3)',
        }}
      >
        <RotateCcw size={20} />
      </motion.button>
    </div>
  )
}
