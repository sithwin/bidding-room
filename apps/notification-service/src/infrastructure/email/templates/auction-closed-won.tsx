import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; winningBid: string; invoiceUrl: string; dueDate: string }

function AuctionClosedWonEmail({ lotTitle, winningBid, invoiceUrl, dueDate }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Congratulations — you won!</Text>
          <Text>You are the winning bidder for <strong>{lotTitle}</strong>.</Text>
          <Text>Winning bid: <strong>{winningBid}</strong></Text>
          <Text>Payment due by: <strong>{dueDate}</strong></Text>
          <Button href={invoiceUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>View Invoice & Pay</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderAuctionClosedWonEmail(props: Props): Promise<string> {
  return render(<AuctionClosedWonEmail {...props} />);
}
