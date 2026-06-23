import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; closingAt: string; currentBid: string; lotUrl: string }

function AuctionClosingSoonEmail({ lotTitle, closingAt, currentBid, lotUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Auction closing soon</Text>
          <Text><strong>{lotTitle}</strong> closes at {closingAt}.</Text>
          <Text>Current highest bid: <strong>{currentBid}</strong></Text>
          <Button href={lotUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>View Auction</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderAuctionClosingSoonEmail(props: Props): Promise<string> {
  return render(<AuctionClosingSoonEmail {...props} />);
}
