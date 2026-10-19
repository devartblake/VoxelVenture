"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { apiOn } from '@/lib/data/api';
import { useAccount } from '@/lib/state/accountStore';
import { useCart } from '@/lib/state/cartStore';

// The cart button, with how many lines are in it (the game's header and the business pages' menu). Only with a game server and an account: the cart
// is kept on the server (services/api/cart.mjs). It opens /cart.
export default function CartButton({ className = '' }) {
  const account = useAccount((s) => s.account);
  const count = useCart((s) => s.cart?.count ?? 0);
  useEffect(() => {
    useCart.getState().load();
  }, [account?.id]);
  if (!apiOn() || !account) return null;
  return (
    <Link
      href="/cart"
      data-testid="cart-button"
      aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
      className={`relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-sx-stroke bg-sx-alt px-3 text-xs font-medium text-slate-100 transition hover:bg-sx-stroke ${className}`}
    >
      <ShoppingCart aria-hidden="true" className="h-4 w-4 text-sx-cyan" />
      <span className="max-sm:sr-only">Cart</span>
      {count > 0 && <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-sx-purple px-1 text-[11px] font-bold text-white">{count}</span>}
    </Link>
  );
}
