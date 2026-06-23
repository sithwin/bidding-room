import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { otpCode: string }

function PhoneVerificationEmail({ otpCode }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Your verification code</Text>
          <Text style={{ fontSize: '36px', fontWeight: 'bold', letterSpacing: '8px' }}>{otpCode}</Text>
          <Text style={{ color: '#666' }}>This code expires in 10 minutes. Do not share it with anyone.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderPhoneVerificationEmail(props: Props): Promise<string> {
  return render(<PhoneVerificationEmail {...props} />);
}
