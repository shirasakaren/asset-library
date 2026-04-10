'use client';

import { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useAuthedFetch } from '@/lib/api/client';
import { toast } from '@/components/ui/toaster';
import type { AdminCategory } from '@/lib/api/admin-types';

interface Props {
  category?: AdminCategory | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function CategoryEditModal({ category, onOpenChange, onDone }: Props) {
  const fetcher = useAuthedFetch();
  const editing = Boolean(category);
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [nameEn, setNameEn] = useState(category?.name?.en ?? '');
  const [nameId, setNameId] = useState(category?.name?.id ?? '');
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!slug || !nameEn) {
      toast.error('Slug and English name are required.');
      return;
    }
    setBusy(true);
    try {
      const payload = { slug, name: { en: nameEn, id: nameId || nameEn }, isActive };
      if (editing && category) {
        await fetcher(`/admin/categories/${category.id}`, { method: 'PATCH', body: payload });
      } else {
        await fetcher('/admin/categories', { method: 'POST', body: payload });
      }
      toast.success(editing ? 'Category updated' : 'Category created');
      onDone();
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>{editing ? 'Edit category' : 'New category'}</ModalTitle>
        </ModalHeader>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="cat-name-en" label="Name (EN)" required>
              <Input
                id="cat-name-en"
                value={nameEn}
                onChange={(e) => {
                  const v = e.target.value;
                  setNameEn(v);
                  if (!editing) setSlug(slugify(v));
