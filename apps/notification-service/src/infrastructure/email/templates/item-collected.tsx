import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string }

function ItemCollectedEmail({ lotTitle }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Collection confirmed</Text>
          <Text>Your collection of <strong>{lotTitle}</strong> has been confirmed. Enjoy!</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderItemCollectedEmail(props: Props): Promise<string> {
  return render(<ItemCollectedEmail {...props} />);
}
