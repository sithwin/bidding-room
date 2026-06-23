import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string }

function AuctionClosedUnsoldEmail({ lotTitle }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Auction ended</Text>
          <Text>The auction for <strong>{lotTitle}</strong> has ended. The lot did not sell on this occasion.</Text>
          <Text style={{ color: '#666' }}>Keep an eye on our upcoming auctions for more opportunities.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderAuctionClosedUnsoldEmail(props: Props): Promise<string> {
  return render(<AuctionClosedUnsoldEmail {...props} />);
}
