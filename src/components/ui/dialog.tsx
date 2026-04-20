import {
  Dialog as HeadlessDialog,
  DialogPanel,
  DialogTitle as HeadlessDialogTitle,
  Description as HeadlessDescription,
  DialogBackdrop,
} from '@headlessui/react'
import { clsx } from 'clsx'
import React from 'react'

type DialogProps = {
  open: boolean
  onClose: () => void
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export function Dialog({ open, onClose, size = 'md', children }: DialogProps) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className={clsx(
          'w-full bg-white rounded-2xl p-6 shadow-xl border border-gray-200',
          sizes[size]
        )}>
          {children}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  )
}

export function DialogTitle({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof HeadlessDialogTitle>) {
  return (
    <HeadlessDialogTitle {...props} className={clsx('text-base font-semibold text-gray-900', className)}>
      {children}
    </HeadlessDialogTitle>
  )
}

export function DialogDescription({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof HeadlessDescription>) {
  return (
    <HeadlessDescription {...props} className={clsx('text-sm text-gray-500 mt-1', className)}>
      {children}
    </HeadlessDescription>
  )
}

export function DialogBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('mt-4', className)}>{children}</div>
}

export function DialogActions({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx('mt-6 flex flex-row-reverse gap-3', className)}>
      {children}
    </div>
  )
}
