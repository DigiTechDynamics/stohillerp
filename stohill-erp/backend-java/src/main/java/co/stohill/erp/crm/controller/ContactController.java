package co.stohill.erp.crm.controller;

import co.stohill.erp.crm.models.Contact;
import co.stohill.erp.crm.repository.ContactRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/crm/contacts")
@RequiredArgsConstructor
public class ContactController {

    private final ContactRepository contactRepository;

    @GetMapping
    public List<Contact> getAllContacts() {
        return contactRepository.findAll();
    }

    @SuppressWarnings("null")
    @GetMapping("/{id}")
    public ResponseEntity<Contact> getContactById(@PathVariable UUID id) {
        return contactRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @PostMapping
    public Contact createContact(@RequestBody Contact contact) {
        return contactRepository.save(contact);
    }

    @SuppressWarnings("null")
    @PutMapping("/{id}")
    public ResponseEntity<Contact> updateContact(@PathVariable UUID id, @RequestBody Contact contactDetails) {
        return contactRepository.findById(id)
                .map(contact -> {
                    contact.setFirstName(contactDetails.getFirstName());
                    contact.setLastName(contactDetails.getLastName());
                    contact.setEmail(contactDetails.getEmail());
                    contact.setStatus(contactDetails.getStatus());
                    return ResponseEntity.ok(contactRepository.save(contact));
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
