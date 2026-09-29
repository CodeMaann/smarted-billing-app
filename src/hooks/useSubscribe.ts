import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useSubscribe() {
  const { currentUser, refreshAppUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubscribe = async () => {
    if (!currentUser) return;
    setLoading(true);
    setLoadingText('Initializing payment...');
    try {
      const res = await loadRazorpayScript();
      if (!res) {
        alert('Razorpay SDK failed to load. Are you online?');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.uid, email: currentUser.email }),
      });
      const data = await response.json();
      
      if (!data.subscriptionId) {
         throw new Error('Could not create subscription');
      }

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        subscription_id: data.subscriptionId,
        name: 'Smarted Billing System',
        description: 'Unlimited billing & inventory access',
        handler: async function (response: any) {
          setLoadingText('Confirming your payment...');
          setLoading(true);
          try {
            const verifyRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: currentUser.uid,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            if (verifyRes.ok) {
              await refreshAppUser();
            } else {
              alert('Payment verification failed.');
            }
          } catch (error) {
            console.error('Verification error', error);
            alert('Payment verification failed.');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
         setLoading(false);
      });
      rzp.open();

    } catch (err) {
      console.error(err);
      alert('Something went wrong.');
      setLoading(false);
    }
  };

  return { handleSubscribe, loading, loadingText };
}
