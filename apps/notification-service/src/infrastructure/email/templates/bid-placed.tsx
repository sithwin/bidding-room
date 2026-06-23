import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; currentBid: string; lotUrl: string }

function BidPlacedEmail({ lotTitle, currentBid, lotUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>You've been outbid</Text>
          <Text>Someone has placed a higher bid on <strong>{lotTitle}</strong>.</Text>
          <Text>Current highest bid: <strong>{currentBid}</strong></Text>
          <Button href={lotUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>Bid Again</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderBidPlacedEmail(props: Props): Promise<string> {
  return render(<BidPlacedEmail {...props} />);
}
