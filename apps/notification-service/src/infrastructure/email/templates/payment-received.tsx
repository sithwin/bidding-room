import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; amount: string; currency: string; fulfilmentUrl: string }

function PaymentReceivedEmail({ lotTitle, amount, currency, fulfilmentUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Payment confirmed</Text>
          <Text>Thank you — your payment of <strong>{amount} {currency}</strong> for <strong>{lotTitle}</strong> has been received.</Text>
          <Text>Please let us know how you'd like to receive your item.</Text>
          <Button href={fulfilmentUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>Choose Delivery</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderPaymentReceivedEmail(props: Props): Promise<string> {
  return render(<PaymentReceivedEmail {...props} />);
}
