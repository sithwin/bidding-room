import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; trackingNumber: string; carrier: string }

function ItemDispatchedEmail({ lotTitle, trackingNumber, carrier }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Your item has been dispatched</Text>
          <Text><strong>{lotTitle}</strong> is on its way.</Text>
          <Text>Carrier: <strong>{carrier}</strong></Text>
          <Text>Tracking number: <strong>{trackingNumber}</strong></Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderItemDispatchedEmail(props: Props): Promise<string> {
  return render(<ItemDispatchedEmail {...props} />);
}
