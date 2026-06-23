import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { verificationUrl: string }

function UserRegisteredEmail({ verificationUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f9f9f9' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Welcome to The Carat Room</Text>
          <Text>Please verify your email address to continue.</Text>
          <Button href={verificationUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>
            Verify Email
          </Button>
          <Text style={{ color: '#666', fontSize: '12px' }}>This link expires in 24 hours.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderUserRegisteredEmail(props: Props): Promise<string> {
  return render(<UserRegisteredEmail {...props} />);
}
