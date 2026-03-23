package co.stohill.erp.properties.controller;

import co.stohill.erp.properties.models.Property;
import co.stohill.erp.properties.repository.PropertyRepository;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/properties")
@RequiredArgsConstructor
public class PropertyController {

    private final PropertyRepository propertyRepository;

    @GetMapping
    public List<Property> getAllProperties() {
        return propertyRepository.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Property> getPropertyById(@PathVariable @NonNull UUID id) {
        return propertyRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @PostMapping
    public Property createProperty(@RequestBody Property property) {
        return propertyRepository.save(property);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Property> updateProperty(@PathVariable @NonNull UUID id,
            @RequestBody @NonNull Property propertyDetails) {
        return propertyRepository.findById(id)
                .map(property -> {
                    property.setName(propertyDetails.getName());
                    property.setStatus(propertyDetails.getStatus());
                    property.setCurrentValuation(propertyDetails.getCurrentValuation());
                    return ResponseEntity.ok(propertyRepository.save(property));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProperty(@PathVariable @NonNull UUID id) {
        return propertyRepository.findById(id)
                .map(property -> {
                    propertyRepository.delete(property);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
