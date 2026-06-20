import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'

interface InvitationEmailProps {
  link: string
  merged: Record<string, string>
}

const BLW_COLORS = {
  primary: '#4C2A92',
  secondary: '#E8A020',
  background: '#F4F1EA',
  dark: '#2D2A22',
  light: '#9E9488',
}

export function InvitationEmail({ link, merged }: InvitationEmailProps) {
  const recipientName = merged.recipient_name || merged.name || merged.full_name || 'Friend'
  const eventName = merged.event_name || 'an event'
  const eventDate = merged.date || merged.event_date || ''
  const eventTime = merged.time || merged.event_time || ''
  const venue = merged.venue || ''
  const hostName = merged.host_name || merged.host || 'BLW CAN NEXUS'
  const rsvpBy = merged.rsvp_by || ''
  const rsvpEmail = merged.rsvp_email || 'invites@blwcannexus.ca'

  const previewText = `You're invited to ${eventName}`

  return (
    <Html>
      <Head>
        <Preview>{previewText}</Preview>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Body style={{ backgroundColor: BLW_COLORS.background, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto' }}>
          {/* Header with BLW Logo */}
          <Section style={{ paddingTop: '32px', paddingBottom: '32px', textAlign: 'center' }}>
            <Img
              src="https://blwcannexus.ca/logo.png"
              alt="BLW CAN NEXUS"
              width="120"
              height="40"
              style={{ display: 'block', margin: '0 auto 16px' }}
            />
          </Section>

          {/* Main Content */}
          <Section
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '40px 32px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            {/* Greeting */}
            <Text
              style={{
                fontSize: '16px',
                lineHeight: '1.6',
                color: BLW_COLORS.dark,
                margin: '0 0 24px 0',
              }}
            >
              Hi {recipientName},
            </Text>

            {/* Teaser */}
            <Text
              style={{
                fontSize: '24px',
                fontWeight: '700',
                lineHeight: '1.4',
                color: BLW_COLORS.primary,
                margin: '0 0 32px 0',
                fontFamily: 'Georgia, serif',
              }}
            >
              You're invited to {eventName}
            </Text>

            {/* Event Details */}
            <Section style={{ margin: '32px 0', lineHeight: '1.8' }}>
              {eventDate && (
                <Row style={{ marginBottom: '12px' }}>
                  <Text
                    style={{
                      fontSize: '14px',
                      color: BLW_COLORS.dark,
                      margin: '0',
                      lineHeight: '1.5',
                    }}
                  >
                    <strong style={{ color: BLW_COLORS.primary }}>Date:</strong> {eventDate}
                  </Text>
                </Row>
              )}

              {eventTime && (
                <Row style={{ marginBottom: '12px' }}>
                  <Text
                    style={{
                      fontSize: '14px',
                      color: BLW_COLORS.dark,
                      margin: '0',
                      lineHeight: '1.5',
                    }}
                  >
                    <strong style={{ color: BLW_COLORS.primary }}>Time:</strong> {eventTime}
                  </Text>
                </Row>
              )}

              {venue && (
                <Row style={{ marginBottom: '12px' }}>
                  <Text
                    style={{
                      fontSize: '14px',
                      color: BLW_COLORS.dark,
                      margin: '0',
                      lineHeight: '1.5',
                    }}
                  >
                    <strong style={{ color: BLW_COLORS.primary }}>Venue:</strong> {venue}
                  </Text>
                </Row>
              )}

              <Row>
                <Text
                  style={{
                    fontSize: '14px',
                    color: BLW_COLORS.dark,
                    margin: '0',
                    lineHeight: '1.5',
                  }}
                >
                  <strong style={{ color: BLW_COLORS.primary }}>Host:</strong> {hostName}
                </Text>
              </Row>
            </Section>

            {/* CTA Button */}
            <Section style={{ margin: '40px 0', textAlign: 'center' }}>
              <Button
                href={link}
                style={{
                  backgroundColor: BLW_COLORS.primary,
                  color: 'white',
                  padding: '14px 40px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '700',
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Open Your Invitation
              </Button>
            </Section>

            {/* Footer */}
            <Hr style={{ borderColor: '#e0e0e0', margin: '32px 0' }} />

            <Text
              style={{
                fontSize: '12px',
                color: BLW_COLORS.light,
                margin: '16px 0 0 0',
                textAlign: 'center',
                lineHeight: '1.5',
              }}
            >
              {rsvpBy && (
                <>
                  Please RSVP by <strong>{rsvpBy}</strong> to{' '}
                  <Link href={`mailto:${rsvpEmail}`} style={{ color: BLW_COLORS.primary, textDecoration: 'underline' }}>
                    {rsvpEmail}
                  </Link>
                </>
              )}
            </Text>
          </Section>

          {/* Bottom spacer */}
          <Section style={{ paddingTop: '32px', paddingBottom: '32px' }}>
            <Text
              style={{
                fontSize: '11px',
                color: BLW_COLORS.light,
                textAlign: 'center',
                margin: '0',
              }}
            >
              © 2026 BLW CAN NEXUS. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default InvitationEmail
