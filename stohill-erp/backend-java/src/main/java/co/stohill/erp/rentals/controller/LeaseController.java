package co.stohill.erp.rentals.controller;

import co.stohill.erp.rentals.models.Lease;
import co.stohill.erp.rentals.repository.LeaseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rentals/leases")
@RequiredArgsConstructor
public class LeaseController {

    private final LeaseRepository leaseRepository;

    @GetMapping
    public List<Lease> getAllLeases() {
        return leaseRepository.findAll();
    }

    @SuppressWarnings("null")
    @GetMapping("/{id}")
    public ResponseEntity<Lease> getLeaseById(@PathVariable UUID id) {
        return leaseRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @PostMapping
    public Lease createLease(@RequestBody Lease lease) {
        return leaseRepository.save(lease);
    }
}
