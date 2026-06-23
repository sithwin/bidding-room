import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string }

function InvoiceExpiredEmail({ lotTitle }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Payment window closed</Text>
          <Text>Your payment window for <strong>{lotTitle}</strong> has expired. The lot has been released.</Text>
          <Text style={{ color: '#666' }}>If you believe this is an error, please contact us.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderInvoiceExpiredEmail(props: Props): Promise<string> {
  return render(<InvoiceExpiredEmail {...props} />);
}
