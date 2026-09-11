'use client'

import { CheckCircle2, MailCheck, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useActionState } from 'react'
import { confirmAccount } from './actions'

/**
 * Chybová obrazovka potvrzení — sdílí ji formulář (neplatný token) i stránka
 * (odkaz úplně bez tokenu), aby obě situace mluvily stejně.
 */
export function ConfirmErrorView() {
  return (
    <div className="text-center">
      <XCircle
        className="mx-auto mb-4 h-12 w-12 text-accent"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <p className="text-[15px] leading-relaxed text-ink-2">
        Odkaz je pravděpodobně už použitý nebo prošlý. Jestli se nemůžeš přihlásit, zkus registraci
        znovu — na už potvrzený účet se prostě přihlas.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/prihlaseni"
          className="rounded-full bg-brand px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-deep"
        >
          Přihlásit se
        </Link>
        <Link
          href="/registrace"
          className="rounded-full border-2 border-line-strong px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-ink-2 transition-colors hover:border-brand hover:text-brand"
        >
          Registrovat znovu
        </Link>
      </div>
    </div>
  )
}

/**
 * Formulář „Potvrdit účet" + obrazovky výsledku.
 *
 * Ověření spouští až kliknutí (viz actions.ts — ochrana před e-mailovými
 * skenery). Výsledek drží `useActionState` v paměti stránky, ne v URL —
 * adresa se neodesláním nemění a úspěch nejde „vyrobit" ručně.
 */
export function ConfirmAccountForm({ token }: { token: string }) {
  const [result, formAction, isPending] = useActionState(confirmAccount, null)

  if (result === 'ok') {
    return (
      <div className="text-center">
        <CheckCircle2
          className="mx-auto mb-4 h-12 w-12 text-ok"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <p className="text-[15px] leading-relaxed text-ink-2">
          Hotovo — teď se můžeš přihlásit a tvůj obsah bude pod tvým jménem.
        </p>
        <Link
          href="/prihlaseni"
          className="mx-auto mt-6 block w-fit rounded-full bg-brand px-9 py-3 font-heading text-[14px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-deep"
        >
          Přihlásit se
        </Link>
      </div>
    )
  }

  if (result === 'chyba') return <ConfirmErrorView />

  return (
    <div className="text-center">
      <MailCheck
        className="mx-auto mb-4 h-12 w-12 text-brand"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <p className="text-[15px] leading-relaxed text-ink-2">
        Zbývá poslední krok — potvrď svůj účet tlačítkem níž.
      </p>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          disabled={isPending}
          className="mx-auto mt-6 block w-fit rounded-full bg-brand px-9 py-3 font-heading text-[14px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-deep disabled:cursor-default disabled:opacity-60"
        >
          {isPending ? 'Potvrzuji…' : 'Potvrdit účet'}
        </button>
      </form>
    </div>
  )
}
