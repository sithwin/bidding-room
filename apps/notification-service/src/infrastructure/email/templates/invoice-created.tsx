import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; amount: string; currency: string; dueDate: string; checkoutUrl: string }

function InvoiceCreatedEmail({ lotTitle, amount, currency, dueDate, checkoutUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Your invoice is ready</Text>
          <Text>Invoice for: <strong>{lotTitle}</strong></Text>
          <Text>Amount due: <strong>{amount} {currency}</strong></Text>
          <Text>Due by: <strong>{dueDate}</strong></Text>
          <Button href={checkoutUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>Pay Now</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderInvoiceCreatedEmail(props: Props): Promise<string> {
  return render(<InvoiceCreatedEmail {...props} />);
}
